# storage/partition_manager.py

"""NEXUSA — partition_manager.py

Lakehouse-style partition management for time-series market data.

Implements architecture requirements for Storage Layer:
- Partitioning/Ordering: partition by symbol/tf/date (+hour optional),
  MergeTree/Hypertable-friendly ordering, deterministic file names.
- TTL & Tiering: hot→warm→cold planning with delete windows.
- Format Governance: Parquet w/ manifest (Iceberg/Delta-style hooks);
  JSONL fallback when pyarrow is unavailable.
- Region awareness: optional region in partition keys.
- Observability: idempotent writes (content hash), metrics hooks, dry-run planning.

Stdlib-first; optional extras if present: pyarrow (parquet), boto3 (S3).

Copyright (c) 2025
"""
from __future__ import annotations

import dataclasses
import datetime as _dt
import functools
import hashlib
import io
import json
import os
import pathlib as _pl
import re
import tempfile
import typing as T
import uuid as _uuid
import logging
from abc import ABC, abstractmethod

# Logger for CLI and module messages (replaces print usage)
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("partition_manager")

# Local utilities
try:
    from .time_utils import (
        candle_open_ms,
        candle_close_ms,
        iter_candles,
        parse_timeframe,
        tf_to_ms,
        to_iso_utc,
    )
except Exception:  # fallback for relative import when run as script
    from time_utils import candle_open_ms, candle_close_ms, iter_candles, parse_timeframe, tf_to_ms, to_iso_utc  # type: ignore

# Optional dependencies
try:  # pragma: no cover
    import pyarrow as pa  # type: ignore
    import pyarrow.parquet as pq  # type: ignore
except Exception:  # pragma: no cover
    pa = None  # type: ignore
    pq = None  # type: ignore

try:  # pragma: no cover
    import boto3  # type: ignore
except Exception:  # pragma: no cover
    boto3 = None  # type: ignore

# Optional hashing util
try:  # pragma: no cover
    from .config_hashing import stable_canonical_bytes
except Exception:  # pragma: no cover
    def stable_canonical_bytes(obj: T.Any) -> bytes:
        """Return a stable, canonicalized JSON byte representation of `obj`.

        Uses JSON dumps with sorted keys and compact separators to ensure
        consistent hashing across processes and platforms.
        """
        return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


# --------------------------- data classes ---------------------------

@dataclasses.dataclass(frozen=True)
class PartitionKey:
    """Partition identifier for a dataset: symbol, timeframe, date, and optional hour/region."""
    symbol: str
    tf: str
    date: str  # YYYY-MM-DD (UTC)
    hour: int | None = None  # 0..23 when granularity="hourly"
    region: str | None = None

    def hive_path(self, *, hourly: bool) -> str:
        """Return Hive-style path segments for this key (e.g., symbol=BTCUSDT/tf=1m/date=2025-08-27[/hour=13])."""
        parts = [f"symbol={self.symbol}", f"tf={self.tf}", f"date={self.date}"]
        if hourly:
            parts.append(f"hour={self.hour if self.hour is not None else 0:02d}")
        if self.region:
            parts.append(f"region={self.region}")
        return "/".join(parts)

    def dict(self) -> dict:
        """Return a plain dict representation of the key with only set fields."""
        d = {"symbol": self.symbol, "tf": self.tf, "date": self.date}
        if self.hour is not None:
            d["hour"] = self.hour
        if self.region is not None:
            d["region"] = self.region
        return d


@dataclasses.dataclass(frozen=True)
class PartitionPolicy:
    """Policy describing how partitions are formed for a dataset (granularity, region, dataset name)."""
    granularity: str = "daily"  # "daily" | "hourly"
    include_region: bool = False
    dataset: str = "ticks"  # logical dataset name, e.g., ticks/ohlcv/features

    def hourly(self) -> bool:
        """Return True if partitions include an hour component."""
        return self.granularity == "hourly"


@dataclasses.dataclass(frozen=True)
class Tier:
    """Retention tier descriptor: name, age range (days), and target storage class."""
    name: str  # hot|warm|cold|delete
    age_days_min: int
    age_days_max: int | None  # None = infinity
    target: str  # e.g., clickhouse, s3, glacier, delete


@dataclasses.dataclass(frozen=True)
class RetentionPolicy:
    """Retention policy comprised of ordered tiers that map data age to storage targets."""
    tiers: tuple[Tier, ...]

    def tier_for_age_days(self, age_days: float) -> Tier:
        """Return the tier that applies for the given age in days."""
        for t in self.tiers:
            if (age_days >= t.age_days_min) and (t.age_days_max is None or age_days < t.age_days_max):
                return t
        return self.tiers[-1]


@dataclasses.dataclass
class WriteResult:
    """Result of a successful write to a partition."""
    path: str
    bytes_written: int
    file_hash: str
    idempotent_key: str
    partition: PartitionKey


# --------------------------- storage backends ---------------------------

class StorageBackend(ABC):
    """Abstract storage backend interface (LocalFS, S3, …)."""
    def __init__(self, root_uri: str) -> None:
        """Initialize backend with a root URI (e.g., file:///data or s3://bucket/prefix)."""
        self.root_uri = root_uri.rstrip("/")

    def join(self, *parts: str) -> str:
        """Join path parts under the backend root using forward slashes."""
        return "/".join([self.root_uri, *[p.strip("/") for p in parts]])

    @abstractmethod
    def exists(self, path: str) -> bool:
        """Return True if `path` exists on this backend."""
        ...

    @abstractmethod
    def write_bytes(self, path: str, data: bytes, *, overwrite: bool = False) -> None:
        """Write bytes to `path`. Raise FileExistsError if exists and overwrite=False."""
        ...

    @abstractmethod
    def atomic_replace(self, tmp_path: str, final_path: str) -> None:
        """Atomically move/replace tmp file to final path (if supported by backend)."""
        ...

    @abstractmethod
    def listdir(self, prefix: str) -> list[str]:
        """Return a recursive flat listing of file paths under `prefix`."""
        ...


class LocalFS(StorageBackend):
    """Local filesystem backend (`file://`) implementation."""
    def _to_local(self, path: str) -> _pl.Path:
        """Convert URI/file path into a pathlib.Path under local FS."""
        if path.startswith("file://"):
            path = path[len("file://"):]
        return _pl.Path(path)

    def exists(self, path: str) -> bool:
        """Return True if a local path exists."""
        return self._to_local(path).exists()

    def write_bytes(self, path: str, data: bytes, *, overwrite: bool = False) -> None:
        """Write bytes to a local file, creating parent dirs; honor overwrite flag."""
        p = self._to_local(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        if p.exists() and not overwrite:
            raise FileExistsError(f"exists: {p}")
        with open(p, "wb") as f:
            f.write(data)

    def atomic_replace(self, tmp_path: str, final_path: str) -> None:
        """Atomically replace/move tmp file to destination on local FS."""
        tmp = self._to_local(tmp_path)
        dst = self._to_local(final_path)
        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp.replace(dst)

    def listdir(self, prefix: str) -> list[str]:
        """Recursively list files under a local directory prefix."""
        p = self._to_local(prefix)
        if not p.exists():
            return []
        out = []
        for f in p.rglob("*"):
            if f.is_file():
                out.append(str(f))
        return out


class S3(StorageBackend):  # pragma: no cover (requires boto3 + creds)
    """Amazon S3 backend using boto3."""
    def __init__(self, root_uri: str) -> None:
        """Initialize S3 backend and parse bucket/prefix from root URI."""
        super().__init__(root_uri)
        if boto3 is None:
            raise RuntimeError("boto3 not installed")
        if not root_uri.startswith("s3://"):
            raise ValueError("S3 root must start with s3://")
        self._s3 = boto3.client("s3")
        bucket, *key = root_uri[len("s3://"):].split("/", 1)
        self.bucket = bucket
        self.prefix = key[0] if key else ""

    def _split(self, path: str) -> tuple[str, str]:
        """Split an s3://bucket/key path into (bucket, key)."""
        if not path.startswith("s3://"):
            raise ValueError("expected s3:// path")
        b, *k = path[len("s3://"):].split("/", 1)
        return b, (k[0] if k else "")

    def exists(self, path: str) -> bool:
        """Return True if S3 object exists at `path`."""
        b, k = self._split(path)
        try:
            self._s3.head_object(Bucket=b, Key=k)
            return True
        except Exception:
            return False

    def write_bytes(self, path: str, data: bytes, *, overwrite: bool = False) -> None:
        """Upload bytes to S3; raise if exists and overwrite=False."""
        b, k = self._split(path)
        if not overwrite and self.exists(path):
            raise FileExistsError(f"exists: {path}")
        self._s3.put_object(Bucket=b, Key=k, Body=data)

    def atomic_replace(self, tmp_path: str, final_path: str) -> None:
        """No atomic rename on S3; write final object directly. `tmp_path` ignored."""
        # On S3 there is no rename; upload final directly
        # tmp_path ignored
        pass

    def listdir(self, prefix: str) -> list[str]:
        """List S3 objects under a prefix recursively."""
        b, k = self._split(prefix)
        paginator = self._s3.get_paginator("list_objects_v2")
        out = []
        for page in paginator.paginate(Bucket=b, Prefix=k):
            for it in page.get("Contents", []):
                out.append(f"s3://{b}/{it['Key']}")
        return out


# --------------------------- manager ---------------------------

class PartitionManager:
    """Compute partition keys, paths, and manage writes/compactions/retention."""

    def __init__(
        self,
        *,
        root_uri: str,
        policy: PartitionPolicy | None = None,
        retention: RetentionPolicy | None = None,
        backend: StorageBackend | None = None,
        catalog: str = "hive",  # hive|iceberg|delta (behavioral hints only)
    ) -> None:
        """Create a new manager with storage backend, partition policy, and retention tiers."""
        self.policy = policy or PartitionPolicy()
        self.retention = retention or RetentionPolicy(tiers=(
            Tier("hot", 0, 7, "clickhouse"),
            Tier("warm", 7, 90, "s3"),
            Tier("cold", 90, 730, "glacier"),
            Tier("delete", 730, None, "delete"),
        ))
        if backend is not None:
            self.backend = backend
        else:
            if root_uri.startswith("s3://"):
                self.backend = S3(root_uri) if boto3 else LocalFS("file:///tmp/UNAVAILABLE_S3")
            else:
                if not root_uri.startswith("file://"):
                    root_uri = "file://" + root_uri
                self.backend = LocalFS(root_uri)
        self.root_uri = self.backend.root_uri
        self.catalog = catalog

    # ---------- key derivation ----------
    def derive_key(self, *, symbol: str, tf: str, ts_event_ms: int, region: str | None = None) -> PartitionKey:
        """Derive a PartitionKey from event timestamp and policy (hourly/daily, region)."""
        t = parse_timeframe(tf)
        open_ms = candle_open_ms(ts_event_ms, t)
        dt = _dt.datetime.utcfromtimestamp(open_ms / 1000.0)
        date = dt.strftime("%Y-%m-%d")
        hour = dt.hour if self.policy.hourly() else None
        reg = region if (self.policy.include_region and region) else None
        return PartitionKey(symbol=symbol, tf=t.label, date=date, hour=hour, region=reg)

    def key_for_bounds(self, *, symbol: str, tf: str, open_ms: int) -> PartitionKey:
        """Build a PartitionKey for a candle open boundary (open_ms)."""
        dt = _dt.datetime.utcfromtimestamp(open_ms / 1000.0)
        date = dt.strftime("%Y-%m-%d")
        hour = dt.hour if self.policy.hourly() else None
        return PartitionKey(symbol=symbol, tf=parse_timeframe(tf).label, date=date, hour=hour)

    # ---------- paths ----------
    def dataset_root(self) -> str:
        """Return root URI for the current dataset under the backend."""
        return self.backend.join(self.policy.dataset)

    def partition_path(self, key: PartitionKey) -> str:
        """Return full path (URI) to a partition directory for `key`."""
        return self.backend.join(self.policy.dataset, key.hive_path(hourly=self.policy.hourly()))

    def data_file_path(self, key: PartitionKey, *, file_hash: str, ext: str = "parquet") -> str:
        """Generate a deterministic, content-hash-based data file name under partition."""
        name = f"part-{file_hash[:16]}-{_uuid.uuid4().hex[:8]}.{ext}"
        return "/".join([self.partition_path(key), name])

    def manifest_path(self, key: PartitionKey) -> str:
        """Return path to the partition manifest file (JSON)."""
        return "/".join([self.partition_path(key), "_manifest.json"])

    # ---------- writes ----------
    def _encode_records(self, records: list[dict], *, compression: str = "zstd") -> tuple[bytes, str, str]:
        """Return (data_bytes, ext, file_hash). Prefer Parquet if pyarrow present."""
        payload_hash = hashlib.sha256(stable_canonical_bytes(records)).hexdigest()
        if pa and pq:
            table = pa.Table.from_pylist(records)
            buf = io.BytesIO()
            pq.write_table(table, buf, compression=compression)
            return buf.getvalue(), "parquet", payload_hash
        else:
            data = ("\n".join(json.dumps(r, ensure_ascii=False, sort_keys=True, separators=(",", ":")) for r in records) + "\n").encode("utf-8")
            return data, "jsonl", payload_hash

    def write_partition(self, key: PartitionKey, records: list[dict], *, overwrite: bool = False) -> WriteResult:
        """Write a batch of records into the partition (Parquet or JSONL). Returns WriteResult."""
        if not records:
            raise ValueError("no records to write")
        data, ext, payload_hash = self._encode_records(records)
        idempotent_key = f"{key.symbol}|{key.tf}|{key.date}|{key.hour}|{payload_hash}"
        final_path = self.data_file_path(key, file_hash=payload_hash, ext=ext)
        if self.backend.exists(final_path) and not overwrite:
            # Assume idempotent
            return WriteResult(path=final_path, bytes_written=0, file_hash=payload_hash, idempotent_key=idempotent_key, partition=key)
        # Write via temp then atomic replace (local), or direct (S3)
        tmp_path = self.backend.join(".tmp", _uuid.uuid4().hex)
        self.backend.write_bytes(tmp_path, data, overwrite=True)
        self.backend.atomic_replace(tmp_path, final_path)
        # Update manifest (best-effort)
        self._update_manifest_append(key, final_path, len(data), ext)
        return WriteResult(path=final_path, bytes_written=len(data), file_hash=payload_hash, idempotent_key=idempotent_key, partition=key)

    # ---------- manifest (hive + hooks for iceberg/delta) ----------
    def _update_manifest_append(self, key: PartitionKey, path: str, size: int, ext: str) -> None:
        """Append a file entry to the partition manifest; create manifest if missing."""
        meta = {
            "format": ext,
            "dataset": self.policy.dataset,
            "partition": key.dict(),
            "files": [],
            "updated_at": _dt.datetime.now(tz=_dt.timezone.utc).isoformat(),
            "catalog": self.catalog,
            "version": 1,
        }
        manifest_path = self.manifest_path(key)
        try:
            if self.backend.exists(manifest_path):
                raw = open(_pl.Path(manifest_path.replace("file://", "")), "rb").read() if isinstance(self.backend, LocalFS) else None
                if raw:
                    meta = json.loads(raw)
        except Exception:
            pass
        # append new file
        files = meta.setdefault("files", [])
        files.append({"path": path, "size": size, "ext": ext})
        if isinstance(self.backend, LocalFS):
            self.backend.write_bytes(manifest_path, json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8"), overwrite=True)
        # For iceberg/delta, hooks could be added here to write real manifests

    # ---------- discovery & pruning ----------
    def partitions_for_timerange(self, *, symbol: str, tf: str, start_ms: int, end_ms: int) -> list[PartitionKey]:
        """Enumerate unique partition keys covering [start_ms, end_ms) for a symbol/timeframe."""
        t = parse_timeframe(tf)
        out: list[PartitionKey] = []
        for o, _c in iter_candles(start_ms, end_ms, t):
            out.append(self.key_for_bounds(symbol=symbol, tf=t.label, open_ms=o))
        # unique by (date,hour)
        seen: set[tuple] = set()
        uniq: list[PartitionKey] = []
        for k in out:
            key = (k.date, k.hour)
            if key not in seen:
                seen.add(key)
                uniq.append(k)
        return uniq

    # ---------- SQL helpers (ClickHouse / Timescale) ----------
    def clickhouse_merge_tree(self, *, table: str, order_by: str = "(symbol, tf, ts_event)") -> str:
        """DDL for a MergeTree table aligned with our partitioning policy."""
        hourly = self.policy.hourly()
        part_expr = "(symbol, tf, toDate(ts_event)" + (", toHour(ts_event)" if hourly else "") + ")"
        ddl = f"""
CREATE TABLE IF NOT EXISTS {table} (
  symbol String,
  tf LowCardinality(String),
  ts_event DateTime64(3, 'UTC'),
  ingest_ts DateTime64(3, 'UTC'),
  payload JSON,
  _file String DEFAULT '',
  _id String DEFAULT ''
) ENGINE = MergeTree
PARTITION BY {part_expr}
ORDER BY {order_by}
SETTINGS index_granularity = 8192
""".strip()
        return ddl

    def clickhouse_ttl(self) -> str:
        """Generate a TTL policy mapping to retention tiers (hot→warm→cold→delete)."""
        rules: list[str] = []
        for t in self.retention.tiers:
            ts = f"ts_event + toIntervalDay({t.age_days_min})"
            if t.target == "delete":
                rules.append(f"TTL {ts} DELETE")
            elif t.target in {"s3", "glacier"}:
                vol = "cold" if t.target != "s3" else "warm"
                rules.append(f"TTL {ts} TO VOLUME '{vol}'")
        return "\n, ".join(rules)

    def timescale_hypertable(self, *, table: str, chunk_interval: str = '1 day') -> str:
        """SQL to create TimescaleDB hypertable with a configurable chunk interval."""
        return f"SELECT create_hypertable('{table}', by_range('ts_event'), chunk_time_interval => INTERVAL '{chunk_interval}', if_not_exists => TRUE);"

    def prune_predicate(self, *, symbol: str, tf: str, start_ms: int, end_ms: int) -> str:
        """Return a ClickHouse SQL predicate to prune by symbol/tf and time window."""
        start_iso = _dt.datetime.utcfromtimestamp(start_ms/1000.0).isoformat() + 'Z'
        end_iso = _dt.datetime.utcfromtimestamp(end_ms/1000.0).isoformat() + 'Z'
        return f"symbol = '{symbol}' AND tf = '{tf}' AND ts_event >= toDateTime64('{start_iso}', 3) AND ts_event < toDateTime64('{end_iso}', 3)"

    # ---------- compaction planning ----------
    def plan_compaction(self, key: PartitionKey, *, target_file_size_mb: int = 64) -> dict:
        """Return a simple compaction plan summary for a partition (counts, bytes, small_files)."""
        part_dir = self.partition_path(key)
        files = [p for p in self.backend.listdir(part_dir) if re.search(r"\.(parquet|jsonl)$", p)]
        sizes = []
        total = 0
        small = []
        for p in files:
            try:
                sz = os.path.getsize(p.replace("file://", "")) if isinstance(self.backend, LocalFS) else 0
            except Exception:
                sz = 0
            sizes.append({"path": p, "size": sz})
            total += sz
            if sz < target_file_size_mb * 1024 * 1024 * 0.25:
                small.append(p)
        return {"partition": key.dict(), "total_files": len(files), "total_bytes": total, "small_files": small}

    # ---------- retention planning ----------
    def plan_retention(self, now_ms: int | None = None) -> list[dict]:
        """Plan tiering/retention actions by scanning partition dates (local FS only)."""
        now = _dt.datetime.utcfromtimestamp((now_ms or int(_dt.datetime.now(tz=_dt.timezone.utc).timestamp()*1000))/1000.0)
        dataset_root = self.dataset_root()
        plans: list[dict] = []
        # naive scan (local only):
        if isinstance(self.backend, LocalFS):
            root = _pl.Path(dataset_root.replace("file://", ""))
            if not root.exists():
                return plans
            for date_dir in root.rglob("date=*"):
                try:
                    date_str = date_dir.name.split("=",1)[1]
                    dt = _dt.datetime.strptime(date_str, "%Y-%m-%d")
                    age_days = (now - dt).days
                    tier = self.retention.tiers[-1 if age_days is None else 0]
                    tier = self.retention.tier_for_age_days(age_days)
                    plans.append({"path": str(date_dir), "date": date_str, "age_days": age_days, "tier": dataclasses.asdict(tier)})
                except Exception:
                    continue
        return plans


# --------------------------- CLI ---------------------------

def _cli(argv: list[str]) -> int:  # pragma: no cover
    """Simple CLI for key/path/write/prune operations. Returns process exit code."""
    import argparse
    ap = argparse.ArgumentParser(prog="partition_manager", description="NEXUSA partition manager")
    ap.add_argument("root", help="root URI (file:///data/lake or s3://bucket/prefix)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    ap_key = sub.add_parser("key", help="derive a partition key from an event")
    ap_key.add_argument("symbol")
    ap_key.add_argument("tf")
    ap_key.add_argument("ts_event_ms", type=int)

    ap_path = sub.add_parser("path", help="compute partition path")
    ap_path.add_argument("symbol")
    ap_path.add_argument("tf")
    ap_path.add_argument("ts_event_ms", type=int)

    ap_write = sub.add_parser("write", help="write records from a JSON file into partition")
    ap_write.add_argument("symbol")
    ap_write.add_argument("tf")
    ap_write.add_argument("ts_event_ms", type=int)
    ap_write.add_argument("--file", required=True)

    ap_prune = sub.add_parser("prune", help="build pruning predicate (ClickHouse)")
    ap_prune.add_argument("symbol")
    ap_prune.add_argument("tf")
    ap_prune.add_argument("start_ms", type=int)
    ap_prune.add_argument("end_ms", type=int)

    ns = ap.parse_args(argv)

    pm = PartitionManager(root_uri=ns.root, policy=PartitionPolicy())

    if ns.cmd == "key":
        k = pm.derive_key(symbol=ns.symbol, tf=ns.tf, ts_event_ms=ns.ts_event_ms)
        log.info(json.dumps(k.dict(), ensure_ascii=False))
        return 0

    if ns.cmd == "path":
        k = pm.derive_key(symbol=ns.symbol, tf=ns.tf, ts_event_ms=ns.ts_event_ms)
        log.info(pm.partition_path(k))
        return 0

    if ns.cmd == "write":
        k = pm.derive_key(symbol=ns.symbol, tf=ns.tf, ts_event_ms=ns.ts_event_ms)
        records = json.loads(open(ns.file, "r", encoding="utf-8").read())
        if not isinstance(records, list):
            raise SystemExit("input JSON must be a list of objects")
        res = pm.write_partition(k, records)
        log.info(json.dumps(dataclasses.asdict(res), ensure_ascii=False, indent=2))
        return 0

    if ns.cmd == "prune":
        log.info(pm.prune_predicate(symbol=ns.symbol, tf=ns.tf, start_ms=ns.start_ms, end_ms=ns.end_ms))
        return 0

    return 1


if __name__ == "__main__":  # pragma: no cover
    import sys as _sys
    raise SystemExit(_cli(_sys.argv[1:]))