"""ClickHouse TSDB writer for features/signals (v2 schema).

Provides DDL helpers, batch insert methods, and light adapters for legacy rows.
"""

from __future__ import annotations
import json
import logging
from core.config.config import settings
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Union
from clickhouse_driver import Client as CHClient

# Optional backends
try:  # pragma: no cover
    import clickhouse_connect as _ch_connect  # HTTP client (preferred)
except Exception:
    _ch_connect = None

try:  # pragma: no cover
    from clickhouse_driver import Client as _ch_client  # Native TCP client
except Exception:
    _ch_client = None

log = logging.getLogger("nexusa.storage.tsdb_writer")
logging.basicConfig(level=logging.INFO)

# ---------- Schema (v2) ----------
FEATURES_TABLE = "features_v2"
SIGNALS_TABLE  = "signals_v2"

FEATURES_DDL = f"""
CREATE TABLE IF NOT EXISTS {{db}}.{FEATURES_TABLE} (
    symbol LowCardinality(String),
    tf LowCardinality(Nullable(String)),
    ts EventTime64(3),                  -- milliseconds epoch
    feature_id LowCardinality(String),
    value Float64,
    quality Nullable(Float32),
    meta_json String,
    ingest_ts DateTime64(3) DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(ts)
ORDER BY (symbol, tf, ts, feature_id)
TTL ts + toIntervalDay(365)
SETTINGS index_granularity = 8192
"""

SIGNALS_DDL = f"""
CREATE TABLE IF NOT EXISTS {{db}}.{SIGNALS_TABLE} (
    symbol LowCardinality(String),
    tf LowCardinality(Nullable(String)),
    ts EventTime64(3),                  -- milliseconds epoch
    signal_id LowCardinality(String),
    side LowCardinality(String),
    strength Float32,
    meta_json String,
    ingest_ts DateTime64(3) DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(ts)
ORDER BY (symbol, tf, ts, signal_id)
TTL ts + toIntervalDay(365)
SETTINGS index_granularity = 8192
"""

# ---------- Helpers ----------
def _to_ms_epoch(value: Union[int, float, str, None]) -> int:
    """
    Normalize various timestamp inputs to epoch milliseconds (int).
    Accepts:
      - int/float: seconds or ms (heuristic: >= 1e12 => already ms)
      - ISO-like string: '2025-08-21T12:34:56.789Z' (keep only digits)
      - None: raises ValueError
    """
    if value is None:
        raise ValueError("timestamp is required")

    # Numeric: detect s vs ms
    if isinstance(value, (int, float)):
        v = float(value)
        # if looks like seconds (10 digits), convert to ms
        return int(v * 1000) if v < 1e12 else int(v)

    if isinstance(value, str):
        s = value.strip()
        if s.isdigit():
            v = int(s)
            return v if v >= 1_000_000_000_000 else v * 1000
        # Extract digits (drop - : T Z . etc)
        digits = "".join(ch for ch in s if ch.isdigit())
        if not digits:
            raise ValueError(f"unrecognized timestamp string: {value!r}")
        # Heuristic: YYYYMMDDhhmmss[ms?]
        # Build to epoch via naive parse is overkill; keep robust: if length >= 13 assume ms.
        num = int(digits)
        return num if len(digits) >= 13 else num * 1000

    raise ValueError(f"unsupported timestamp type: {type(value)}")

def _safe_json(val: Any) -> str:
    """Return a JSON string for `val`, tolerating non-serializable values.

    - `None` -> "{}"
    - `str`  -> returned as-is (assumed already JSON)
    - other  -> `json.dumps` with `ensure_ascii=False`, fallback "{}" on error
    """
    if val is None:
        return "{}"
    if isinstance(val, str):
        return val
    try:
        return json.dumps(val, ensure_ascii=False)
    except Exception:
        return "{}"

def _coerce_row_for_features(row: Dict[str, Any]) -> Tuple:
    """
    Unified input:
      Required: symbol, feature_id, value, ts|timestamp
      Optional: tf, quality, meta_json
    Legacy mapping (if present):
      - row['indicators'] dict -> emits multiple rows (handled by adapter below)
    """
    return (
        str(row["symbol"]),
        row.get("tf"),
        _to_ms_epoch(row.get("ts", row.get("timestamp"))),
        str(row["feature_id"]),
        float(row["value"]),
        None if row.get("quality") is None else float(row["quality"]),
        _safe_json(row.get("meta_json", {})),
    )

def _coerce_row_for_signals(row: Dict[str, Any]) -> Tuple:
    """
    Unified input:
      Required: symbol, signal_id, strength, ts|timestamp
      Optional: tf, side, meta_json
    Legacy mapping:
      - direction -> side
      - score -> strength
      - created_at (ISO-ish) -> ts
      - model_id -> meta_json.model_id
    """
    side = row.get("side", row.get("direction", ""))
    strength = row.get("strength", row.get("score"))
    if strength is None:
        raise ValueError("strength/score is required for signals")

    ts_value = row.get("ts", row.get("timestamp", row.get("created_at")))
    meta = row.get("meta_json", {})
    if not isinstance(meta, dict):
        meta = {"_raw_meta": meta}
    if "model_id" in row and "model_id" not in meta:
        meta["model_id"] = row["model_id"]

    return (
        str(row["symbol"]),
        row.get("tf"),
        _to_ms_epoch(ts_value),
        str(row["signal_id"]),
        str(side or ""),
        float(strength),
        _safe_json(meta),
    )

# ---------- Client Abstraction ----------
class ClickHouseWriter:
    """
    Abstraction over ClickHouse clients with DDL and batch inserts.
    - Prefers clickhouse-connect (HTTP) if available; falls back to clickhouse-driver (TCP).
    """

    def __init__(
        self,
        host: str = "localhost",
        http_port: int = 8123,          # for clickhouse-connect
        tcp_port: int = 9000,           # for clickhouse-driver
        user: str = "default",
        password: str = "",
        database: str = "nexusa",
        secure: bool = False,
        alt_driver: Optional[str] = None,   # "driver" to force clickhouse-driver
        settings: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Initialize a ClickHouse client (HTTP preferred, TCP fallback).

        Args:
            host: Server hostname/IP.
            http_port: HTTP port for clickhouse-connect.
            tcp_port: Native TCP port for clickhouse-driver.
            user: Username.
            password: Password.
            database: Default database to use.
            secure: Use HTTPS for clickhouse-connect if True.
            alt_driver: Set to "driver" to force clickhouse-driver backend.
            settings: Extra client settings dict passed to the underlying client.

        Raises:
            RuntimeError: If no supported client library is available.
        """
        self.database = database
        self._driver = None
        self._client = None

        if alt_driver == "driver":
            if _ch_client is None:
                raise RuntimeError("clickhouse-driver not available")
            self._driver = "driver"
            self._client = _ch_client(
                host=host, port=tcp_port, user=user, password=password,
                database=database, settings=settings or {}
            )
        else:
            if _ch_connect is None and _ch_client is None:
                raise RuntimeError("Neither clickhouse-connect nor clickhouse-driver is available")
            if _ch_connect is not None:
                self._driver = "connect"
                self._client = _ch_connect.get_client(
                    host=host, port=http_port, username=user, password=password,
                    database=database, secure=secure, settings=settings or {}
                )
            else:
                self._driver = "driver"
                self._client = _ch_client(
                    host=host, port=tcp_port, user=user, password=password,
                    database=database, settings=settings or {}
                )

    # ---------------- DDL ----------------
    def create_database_if_not_exists(self, db: Optional[str] = None) -> None:
        """Create the database if it doesn't exist (idempotent)."""
        db = db or self.database
        self._execute(f"CREATE DATABASE IF NOT EXISTS {db}")

    def create_tables(self, db: Optional[str] = None) -> None:
        """Create required tables (features_v2, signals_v2) if missing."""
        db = db or self.database
        self._execute(FEATURES_DDL.format(db=db))
        self._execute(SIGNALS_DDL.format(db=db))

    # ---------------- Inserts (v2) ----------------
    def insert_features(self, rows: List[Dict[str, Any]], db: Optional[str] = None) -> int:
        """
        rows (v2): dicts with keys:
          symbol, feature_id, value, ts(ms) | timestamp, [tf], [quality], [meta_json]
        """
        if not rows:
            return 0
        db = db or self.database
        tuples = [_coerce_row_for_features(r) for r in rows]
        if self._driver == "connect":
            # Do NOT include ingest_ts (defaults in CH)
            self._client.insert(
                f"{db}.{FEATURES_TABLE}",
                tuples,
                column_names=["symbol","tf","ts","feature_id","value","quality","meta_json"],
            )
        else:
            self._client.execute(
                f"INSERT INTO {db}.{FEATURES_TABLE} "
                f"(symbol, tf, ts, feature_id, value, quality, meta_json) VALUES",
                tuples,
            )
        return len(tuples)

    def insert_signals(self, rows: List[Dict[str, Any]], db: Optional[str] = None) -> int:
        """
        rows (v2): dicts with keys:
          symbol, signal_id, strength|score, ts|timestamp|created_at, [tf], [side|direction], [meta_json], [model_id]
        """
        if not rows:
            return 0
        db = db or self.database
        tuples = [_coerce_row_for_signals(r) for r in rows]
        if self._driver == "connect":
            self._client.insert(
                f"{db}.{SIGNALS_TABLE}",
                tuples,
                column_names=["symbol","tf","ts","signal_id","side","strength","meta_json"],
            )
        else:
            self._client.execute(
                f"INSERT INTO {db}.{SIGNALS_TABLE} "
                f"(symbol, tf, ts, signal_id, side, strength, meta_json) VALUES",
                tuples,
            )
        return len(tuples)

    # ---------------- Low-level ----------------
    def _execute(self, query: str) -> None:
        """Execute a SQL statement using the active backend."""
        if self._driver == "connect":
            self._client.command(query)
        else:
            self._client.execute(query)

    def close(self) -> None:
        """Close underlying client if supported; ignore errors."""
        try:
            if self._driver == "connect" and hasattr(self._client, "close"):
                self._client.close()
        except Exception as e:
            log.debug("CH close ignored: %s", e)

# ---------- Legacy compatibility adapters ----------
def adapt_legacy_features_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Accept legacy rows of shape:
      { symbol, tf, timestamp(UInt64 seconds or ms), indicators: {adx, atr, vwap}, ... }
    Emit v2 rows (one per indicator).
    """
    out: List[Dict[str, Any]] = []
    for r in rows:
        symbol = r["symbol"]
        tf = r.get("tf")
        ts = r.get("ts", r.get("timestamp"))
        indicators = r.get("indicators", {}) or {}
        if not isinstance(indicators, dict):
            continue
        for fid in ("adx", "atr", "vwap"):
            if fid in indicators and indicators[fid] is not None:
                out.append({
                    "symbol": symbol,
                    "tf": tf,
                    "ts": ts,
                    "feature_id": fid,
                    "value": indicators[fid],
                    "meta_json": r.get("meta_json", {}),
                })
    return out

def adapt_legacy_signals_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Accept legacy rows of shape:
      { signal_id, symbol, tf, created_at(ISO or epoch), score, direction, model_id }
    Emit v2 rows (one per signal).
    """
    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append({
            "signal_id": r["signal_id"],
            "symbol": r["symbol"],
            "tf": r.get("tf"),
            "ts": r.get("ts", r.get("timestamp", r.get("created_at"))),
            "strength": r.get("strength", r.get("score")),
            "side": r.get("side", r.get("direction", "")),
            "meta_json": {"model_id": r.get("model_id", "")},
        })
    return out
