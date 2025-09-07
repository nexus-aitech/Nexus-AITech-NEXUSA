"""
backtesting/runner.py

Batch runner for backtesting.

Goals:
- Respect layer boundaries: **no static imports from `storage.*`**.
- Provide a minimal, local pipeline to compute simple features & stub signals.
- Read OHLCV rows from storage (if available) via dynamic import; else fall back to local files.
- Write features/signals to storage (if available) via dynamic import; else no-op.

CLI:
    python -m backtesting.runner --mode batch --exchange __EXCHANGE_NAME__ --symbol BTC/USDT --tf 1h --limit 200
"""
from __future__ import annotations
...
ap.add_argument("--exchange", default="__EXCHANGE_NAME__", help="Exchange name (for metadata)")



import argparse
import asyncio
import importlib
import logging
import os
from typing import Any, Dict, List, Optional, Tuple, Callable

import pandas as pd

# Telemetry setup (best-effort)
try:
    from ui.telemetry import setup_logging  # type: ignore
except Exception:  # pragma: no cover
    def setup_logging() -> None:  # type: ignore
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

log = logging.getLogger("backtesting.runner")


# =============================================================================
# Storage adapters (dynamic to avoid layer-violation in static analysis)
# =============================================================================

def _load_storage_writer() -> Tuple[Optional[Callable[[List[Dict[str, Any]]], None]],
                                    Optional[Callable[[List[Dict[str, Any]]], None]]]:
    """Dynamically load storage writer callables (insert_features, insert_signals) if present."""
    try:
        mod = importlib.import_module("storage.tsdb_writer")
        ins_feat = getattr(mod, "insert_features", None)
        ins_sig = getattr(mod, "insert_signals", None)
        if callable(ins_feat) or callable(ins_sig):
            return ins_feat, ins_sig  # type: ignore[return-value]
    except Exception as e:  # pragma: no cover
        log.debug("storage.tsdb_writer unavailable: %s", e)
    return None, None


def _load_storage_reader() -> Optional[Callable[..., pd.DataFrame]]:
    """Dynamically load storage reader callable (get_ohlcv) if present."""
    try:
        mod = importlib.import_module("storage.tsdb_reader")
        fn = getattr(mod, "get_ohlcv", None)
        if callable(fn):
            return fn  # type: ignore[return-value]
    except Exception as e:  # pragma: no cover
        log.debug("storage.tsdb_reader unavailable: %s", e)
    return None


# =============================================================================
# Local pipeline (layer-safe)
# =============================================================================

def _rows_to_frame(rows: List[Dict[str, Any]]) -> pd.DataFrame:
    """Convert list of OHLCV-like rows into a sorted DataFrame with canonical columns.

    Expected row shape:
        {
          "ts_event": <ms since epoch> | ISO string,
          "symbol": "BTC/USDT",
          "tf": "1h",
          "ohlcv": {"o": float, "h": float, "l": float, "c": float, "v": float}
        }
    """
    if not rows:
        return pd.DataFrame(columns=["ts_event", "o", "h", "l", "c", "v", "symbol", "tf"])
    recs = []
    for r in rows:
        ohlcv = r.get("ohlcv", {}) or {}
        ts = r.get("ts_event", 0)
        ts_dt = pd.to_datetime(ts, unit="ms", utc=True) if isinstance(ts, (int, float)) else pd.to_datetime(ts, utc=True)
        recs.append({
            "ts_event": ts_dt,
            "o": float(ohlcv.get("o", 0.0)),
            "h": float(ohlcv.get("h", 0.0)),
            "l": float(ohlcv.get("l", 0.0)),
            "c": float(ohlcv.get("c", 0.0)),
            "v": float(ohlcv.get("v", 0.0)),
            "symbol": (r.get("symbol") or "").replace("/", ""),
            "tf": r.get("tf"),
        })
    df = pd.DataFrame.from_records(recs).sort_values("ts_event")
    return df


def batch_pipeline_local(rows: List[Dict[str, Any]], symbol: str, tf: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Local, self-contained feature + signal pipeline (toy for backtesting).

    Steps:
      1) frame ← rows
      2) features: ret, ma_5, ma_20, vol_20
      3) signals: MA crossovers (LONG on 5>20 cross up, SHORT on cross down)
    """
    df = _rows_to_frame(rows)
    if df.empty:
        return [], []

    df["ret"] = df["c"].pct_change().fillna(0.0)
    df["ma_5"] = df["c"].rolling(5, min_periods=1).mean()
    df["ma_20"] = df["c"].rolling(20, min_periods=1).mean()
    df["vol_20"] = df["ret"].rolling(20, min_periods=1).std().fillna(0.0)

    feats: List[Dict[str, Any]] = []
    sym = symbol.replace("/", "")
    for _, r in df.iterrows():
        feats.append({
            "symbol": sym,
            "tf": tf,
            "ts_event": int(pd.Timestamp(r["ts_event"]).timestamp() * 1000),
            "features": {
                "ret": float(r["ret"]),
                "ma_5": float(r["ma_5"]),
                "ma_20": float(r["ma_20"]),
                "vol_20": float(r["vol_20"]),
            },
        })

    sigs: List[Dict[str, Any]] = []
    long_mask = df["ma_5"] > df["ma_20"]
    for i in range(1, len(df)):
        crossed_up = bool(long_mask.iloc[i] and not long_mask.iloc[i - 1])
        crossed_dn = bool((not long_mask.iloc[i]) and long_mask.iloc[i - 1])
        if crossed_up or crossed_dn:
            ts_ms = int(df["ts_event"].iloc[i].timestamp() * 1000)
            sigs.append({
                "signal_id": f"{sym}:{tf}:{ts_ms}",
                "symbol": sym,
                "tf": tf,
                "created_at": df["ts_event"].iloc[i].isoformat(),
                "direction": "LONG" if crossed_up else "SHORT",
                "score": float(abs(df["ret"].iloc[i])),
            })

    return feats, sigs


# =============================================================================
# Storage-backed fetcher (dynamic import; fallback to local files)
# =============================================================================

def _rows_from_df(df: pd.DataFrame, symbol: str, tf: str) -> List[Dict[str, Any]]:
    """Normalize OHLCV DataFrame to rows expected by `_rows_to_frame`/pipeline."""
    df = df.copy()

    # Determine timestamps (ms)
    if "ts_event" in df.columns:
        ts = pd.to_datetime(df["ts_event"], unit="ms", utc=True)
    elif "timestamp" in df.columns:
        ts = pd.to_datetime(df["timestamp"], utc=True)
    else:
        ts = pd.to_datetime(df.index, utc=True)

    # Map price/vol columns
    def col(*names: str) -> pd.Series:
        for n in names:
            if n in df.columns:
                return df[n]
        raise KeyError(f"Missing columns among {names!r}")

    o = col("o", "open")
    h = col("h", "high")
    l = col("l", "low")
    c = col("c", "close")
    v = col("v", "volume")

    out: List[Dict[str, Any]] = []
    sym = symbol.replace("/", "")
    for i in range(len(df)):
        out.append({
            "symbol": sym,
            "exchange": "STORAGE",
            "ts_event": int(pd.Timestamp(ts.iloc[i]).timestamp() * 1000),
            "ingest_ts": int(pd.Timestamp.utcnow().timestamp() * 1000),
            "tf": tf,
            "ohlcv": {
                "o": float(o.iloc[i]),
                "h": float(h.iloc[i]),
                "l": float(l.iloc[i]),
                "c": float(c.iloc[i]),
                "v": float(v.iloc[i]),
            },
        })
    return out


async def _fetch_ohlcv_one_from_storage(exchange: str, symbol: str, tf: str, since_ms: Optional[int], limit: int) -> List[Dict[str, Any]]:
    """Fetch OHLCV rows via storage reader if available; else from local files.

    Order:
      1) storage.tsdb_reader.get_ohlcv (dynamic import)
      2) data/ohlcv/<symbol>_<tf>.{csv,parquet}
    """
    # 1) storage reader
    try:
        get_ohlcv = _load_storage_reader()
        if get_ohlcv is not None:
            df = get_ohlcv(symbol=symbol, tf=tf, since_ms=since_ms, limit=limit)  # type: ignore[misc]
            if isinstance(df, pd.DataFrame) and not df.empty:
                return _rows_from_df(df, symbol, tf)
    except Exception as e:
        log.info("storage reader failed or unavailable: %s", e)

    # 2) fallback local files
    base = os.path.join("data", "ohlcv")
    stem = f"{symbol.replace('/','')}_{tf}"
    for ext in ("csv", "parquet"):
        path = os.path.join(base, f"{stem}.{ext}")
        if not os.path.exists(path):
            continue
        try:
            df = pd.read_csv(path) if ext == "csv" else pd.read_parquet(path)
            if df.empty:
                continue
            # filter by since
            if since_ms is not None:
                if "ts_event" in df.columns:
                    ts_ms = df["ts_event"].astype("int64")
                else:
                    ts_ms = pd.to_datetime(df["timestamp"], utc=True).astype("int64") // 1_000_000
                df = df.loc[ts_ms >= int(since_ms)]
            # limit tail
            if limit and limit > 0:
                df = df.tail(limit)
            return _rows_from_df(df, symbol, tf)
        except Exception as e:
            log.warning("Failed to load %s: %s", path, e)

    log.warning("No storage/file data found for %s %s; returning empty list.", symbol, tf)
    return []


# =============================================================================
# CLI
# =============================================================================

def main() -> None:
    """Entry point for backtesting runner (batch mode only for now)."""
    setup_logging()

    ap = argparse.ArgumentParser(prog="backtesting.runner", description="NEXUSA Backtesting Runner")
    ap.add_argument("--mode", choices=["batch"], default="batch", help="Run mode")
    ap.add_argument("--exchange", default="binance", help="Exchange name (for metadata)")
    ap.add_argument("--symbol", default="BTC/USDT", help="Trading symbol")
    ap.add_argument("--tf", default="1h", help="Timeframe")
    ap.add_argument("--limit", type=int, default=200, help="Max rows to process")
    args = ap.parse_args()

    if args.mode == "batch":
        rows = asyncio.run(_fetch_ohlcv_one_from_storage(args.exchange, args.symbol, args.tf, None, args.limit))
        feats, sigs = batch_pipeline_local(rows, args.symbol, args.tf)

        insert_features, insert_signals = _load_storage_writer()
        if feats and callable(insert_features):
            try:
                insert_features(feats)  # type: ignore[misc]
            except Exception as e:
                log.error("insert_features failed: %s", e)
        if sigs and callable(insert_signals):
            try:
                insert_signals(sigs)  # type: ignore[misc]
            except Exception as e:
                log.error("insert_signals failed: %s", e)

        log.info("Batch complete — features=%d, signals=%d", len(feats), len(sigs))


if __name__ == "__main__":  # pragma: no cover
    main()
