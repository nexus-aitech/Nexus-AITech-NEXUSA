"""Lightweight file-based JSON Schema Registry + partition/TTL helpers.

- Registry layout:
    {root}/{subject}/
        1.json
        2.json
        latest   (text: latest version number)

- Extras:
    - PartitionKey: کمک به ساخت prefixهای S3 و کوئری‌های ClickHouse
    - TTLPolicy: تعریف سادهٔ TTL برای ClickHouse
"""

from __future__ import annotations
import datetime as _dt
import json
import os
import re
import tempfile
import threading
from typing import Any, Dict, Optional, List
from dataclasses import dataclass

try:  # pragma: no cover
    import jsonschema
except Exception:
    jsonschema = None


_SUBJECT_SAFE_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def _safe_subject(subject: str) -> str:
    """Validate/normalize a subject to prevent path traversal and unsafe names."""
    s = (subject or "").strip()
    if not s or not _SUBJECT_SAFE_RE.fullmatch(s):
        raise ValueError(f"Invalid subject name: {subject!r}")
    return s


def _atomic_write_text(path: str, text: str, encoding: str = "utf-8") -> None:
    """Write text atomically via a temp file replacement to avoid partial writes."""
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", delete=False, dir=d, encoding=encoding) as tmp:
        tmp.write(text)
        tmp_path = tmp.name
    os.replace(tmp_path, path)


def _atomic_write_json(path: str, obj: Dict[str, Any]) -> None:
    """Serialize `obj` as JSON (UTF-8) and write atomically to `path`."""
    payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    _atomic_write_text(path, payload, encoding="utf-8")


class FileSchemaRegistry:
    """
    Minimal local JSON schema registry with versioning.

    Layout:
      {root}/{subject}/
          1.json
          2.json
          latest     (text file containing the latest version number)
    """

    def __init__(self, root_dir: str) -> None:
        """Initialize the registry under an absolute `root_dir` (created if missing)."""
        self.root = os.path.abspath(root_dir)
        os.makedirs(self.root, exist_ok=True)
        self._lock = threading.Lock()

    def _subject_dir(self, subject: str) -> str:
        """Return/ensure the directory path for a given `subject`."""
        subject = _safe_subject(subject)
        p = os.path.join(self.root, subject)
        os.makedirs(p, exist_ok=True)
        return p

    def _latest_path(self, subject: str) -> str:
        """Path to the `latest` marker file for a `subject`."""
        return os.path.join(self._subject_dir(subject), "latest")

    def register(self, subject: str, schema: Dict[str, Any]) -> int:
        """Register a new version and return its version number."""
        if not isinstance(schema, dict):
            raise TypeError("schema must be a dict")
        # optional: basic sanity checks
        if "$schema" in schema and not isinstance(schema["$schema"], str):
            raise ValueError("schema['$schema'] must be a string if provided")

        with self._lock:
            sdir = self._subject_dir(subject)
            versions = [
                int(fn.split(".")[0])
                for fn in os.listdir(sdir)
                if fn.endswith(".json") and fn.split(".")[0].isdigit()
            ]
            next_ver = (max(versions) + 1) if versions else 1
            schema_path = os.path.join(sdir, f"{next_ver}.json")
            _atomic_write_json(schema_path, schema)
            _atomic_write_text(self._latest_path(subject), str(next_ver))
            return next_ver

    def get(self, subject: str, version: Optional[int] = None) -> Dict[str, Any]:
        """Fetch a schema by `subject` and `version`; if `version` is None, load latest."""
        sdir = self._subject_dir(subject)
        if version is None:
            latest_path = self._latest_path(subject)
            if not os.path.exists(latest_path):
                raise FileNotFoundError(f"No versions found for subject {subject!r}")
            with open(latest_path, "r", encoding="utf-8") as f:
                version = int(f.read().strip())
        path = os.path.join(sdir, f"{int(version)}.json")
        if not os.path.exists(path):
            raise FileNotFoundError(f"Schema not found for {subject} v{version}")
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def latest_version(self, subject: str) -> int:
        """Return the latest registered version number for `subject`."""
        with open(self._latest_path(subject), "r", encoding="utf-8") as f:
            return int(f.read().strip())

    def validate(self, subject: str, instance: Dict[str, Any], version: Optional[int] = None) -> None:
        """Validate `instance` against the (optionally versioned) schema for `subject`."""
        schema = self.get(subject, version)
        if jsonschema is not None:
            jsonschema.validate(instance=instance, schema=schema)
        else:
            # Fallback: very shallow validation on required keys
            required = schema.get("required", [])
            missing = [k for k in required if k not in instance]
            if missing:
                raise ValueError(f"Missing required keys: {', '.join(missing)}")


@dataclass(frozen=True)
class PartitionKey:
    """Partition descriptor: (symbol, timeframe, UTC date)."""

    symbol: str
    tf: Optional[str]
    date: _dt.date  # UTC day partition

    @property
    def yyyymmdd(self) -> int:
        """Date as integer YYYYMMDD (UTC)."""
        return int(self.date.strftime("%Y%m%d"))

    def clickhouse_predicate(self, ts_col: str = "ts") -> str:
        """
        Safe WHERE clause to target this partition:
          toYYYYMMDD(ts) = 20250821
        """
        return f"toYYYYMMDD({ts_col}) = {self.yyyymmdd}"

    def as_s3_prefix(self) -> str:
        """Return S3-style prefix: symbol=.../tf=.../date=YYYY-MM-DD/"""
        tf_part = f"tf={self.tf}/" if self.tf else ""
        return f"symbol={self.symbol}/{tf_part}date={self.date.isoformat()}/"


@dataclass
class TTLPolicy:
    """Simple ClickHouse TTL policy (delete after `cold_days`)."""

    # Kept for future tiering (Move to Volume). Currently we only DELETE at cold_days.
    hot_days: int = 7
    warm_days: int = 90
    cold_days: int = 365

    def clickhouse_ttl_clause(self, ts_col: str = "ts") -> str:
        """
        Simple retention policy: delete after cold_days.
        (Tiering requires volumes and multiple TTL expressions; out of scope here.)
        """
        return f"TTL {ts_col} + toIntervalDay({self.cold_days}) DELETE"


def compute_partition(symbol: str, tf: Optional[str], ts_ms: int) -> PartitionKey:
    """Compute a UTC day partition from a millisecond timestamp."""
    # Ensure UTC date from milliseconds
    dt = _dt.datetime.utcfromtimestamp(ts_ms / 1000.0).date()
    return PartitionKey(symbol=symbol, tf=tf, date=dt)


# Default singleton registry + thin wrappers
registry = FileSchemaRegistry(root_dir="schemas")


def register(subject: str, schema: dict) -> int:
    """Module-level helper: register `schema` under `subject` on the default registry."""
    return registry.register(subject, schema)


def get(subject: str, version: int | None = None) -> dict:
    """Module-level helper: fetch a schema (latest if `version` is None)."""
    return registry.get(subject, version)
