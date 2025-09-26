# ingestion/rest_fetcher.py
# NEXUSA — Production-grade REST OHLCV Fetcher (ccxt + Kafka + Prometheus)
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import signal
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import ccxt.async_support as ccxt
from core.kafka_producer import KafkaProducerWrapper as Producer

from dotenv import load_dotenv
load_dotenv()

EXCHANGES = ["binance", "kucoin", "bybit", "okx", "bitget", "coinex", "bingx"]
SYMBOLS = ["BTC/USDT", "ETH/USDT", "BNB/USDT"]

async def fetch_ohlcv(exchange_name, symbol, timeframe="1m", limit=50):
    ex_class = getattr(ccxt, exchange_name)()
    try:
        data = await ex_class.fetch_ohlcv(symbol, timeframe, limit=limit)
        await ex_class.close()
        return data
    except Exception as e:
        await ex_class.close()
        print(f"[Error] {exchange_name} {symbol}: {e}")
        return None

async def fetch_live_stream(broadcast):
    while True:
        for ex in EXCHANGES:
            for symbol in SYMBOLS:
                try:
                    data = await fetch_ohlcv(ex, symbol, "1m")
                    if data:
                        await broadcast({
                            "src": ex,
                            "symbol": symbol,
                            "tf": "1m",
                            "c": data[-1][4],  # آخرین close price
                        })
                except Exception as e:
                    print(f"[Error] {ex} {symbol}: {e}")
        await asyncio.sleep(5)

# ---- Optional schema validation (fallback to sanity checks) -------------------
try:
    from core.schema.ingest_schema import validate_ohlcv  # type: ignore
except Exception:
    def validate_ohlcv(p: Dict[str, Any]) -> bool:
        try:
            o, h, l, c = float(p["o"]), float(p["h"]), float(p["l"]), float(p["c"])
            return h >= max(o, c) >= min(o, c) >= l and p.get("ts", 0) > 0
        except Exception:
            return False

# ---- Prometheus metrics (no-op fallback) -------------------------------------
try:
    from ingestion.metrics import (
        mark_msg, mark_drop, set_lag, set_queue_len, start_metrics_server
    )
except Exception:
    def mark_msg(*a, **k): ...
    def mark_drop(*a, **k): ...
    def set_lag(*a, **k): ...
    def set_queue_len(*a, **k): ...
    def start_metrics_server(port: int = 9108): ...

# ---- Logging ------------------------------------------------------------------
def _setup_logging() -> None:
    level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
    as_json = os.getenv("LOG_AS_JSON", "0") not in {"0", "false", "False", ""}
    if as_json:
        class JsonFormatter(logging.Formatter):
            def format(self, record: logging.LogRecord) -> str:
                base = {
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
                    "lvl": record.levelname,
                    "logger": record.name,
                    "msg": record.getMessage(),
                }
                if record.exc_info:
                    base["exc"] = self.formatException(record.exc_info)
                return json.dumps(base, ensure_ascii=False)
        logging.basicConfig(level=level, handlers=[logging.StreamHandler()])
        for h in logging.getLogger().handlers:
            h.setFormatter(JsonFormatter())
    else:
        logging.basicConfig(
            level=level,
            format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            handlers=[logging.StreamHandler()],
        )

_setup_logging()
log = logging.getLogger("nexusa.ingestion.rest_fetcher")

# ---- Config -------------------------------------------------------------------
def _split_env(name: str) -> List[str]:
    raw = os.getenv(name, "").strip()
    return [s.strip() for s in raw.split(",") if s.strip()]

@dataclass(frozen=True)
class Config:
    # Required lists
    exchanges: List[str]
    symbols: List[str]
    tfs: List[str]
    # Kafka
    kafka_bootstrap: str = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
    topic_ohlcv: str = os.getenv("TOPIC_OHLCV", "ohlcv_raw")
    # Metrics
    metrics_port: int = int(os.getenv("METRICS_PORT", "9108"))
    # Fetch behavior
    batch_candles: int = int(os.getenv("BATCH_CANDLES", "1"))  # latest N per loop
    align_to_minute: bool = os.getenv("ALIGN_MINUTE", "1") not in {"0", "false", "False"}
    request_timeout: float = float(os.getenv("REQUEST_TIMEOUT", "20"))
    max_retries: int = int(os.getenv("MAX_RETRIES", "8"))
    base_backoff: float = float(os.getenv("BASE_BACKOFF", "0.5"))
    backoff_cap: float = float(os.getenv("BACKOFF_CAP", "10"))
    max_concurrent: int = int(os.getenv("MAX_CONCURRENT", "64"))  # scale safely

    # API keys (if present in .env they’ll be injected)
    api_keys: Dict[str, Tuple[Optional[str], Optional[str]]] = None  # type: ignore

    @staticmethod
    def load() -> "Config":
        exs = _split_env("EXCHANGES")
        syms = _split_env("SYMBOLS")
        tfs = _split_env("TFS")
        if not exs or not syms or not tfs:
            raise RuntimeError("EXCHANGES / SYMBOLS / TFS must be set in .env")
        # collect optional keys per exchange (ccxt naming)
        def _k(k: str) -> Optional[str]:
            v = os.getenv(k)
            return v if (v and v.strip()) else None
        api_keys = {
            "binance": (_k("BINANCE_API_KEY"), _k("BINANCE_SECRET_KEY")),
            "bybit": (_k("BYBIT_API_KEY"), _k("BYBIT_SECRET_KEY")),
            "okx": (_k("OKX_API_KEY"), _k("OKX_SECRET_KEY")),
            "kucoin": (_k("KUCOIN_API_KEY"), _k("KUCOIN_SECRET_KEY")),
            "bitget": (_k("BITGET_API_KEY"), _k("BITGET_SECRET_KEY")),
            "coinex": (_k("COINEX_API_KEY"), _k("COINEX_SECRET_KEY")),
            "bingx": (_k("BINGX_API_KEY"), _k("BINGX_SECRET_KEY")),
        }
        return Config(
            exchanges=exs, symbols=syms, tfs=tfs,
            api_keys=api_keys
        )

CFG = Config.load()

# ---- Helpers ------------------------------------------------------------------
def _now_ms() -> int: return int(time.time() * 1000)
def _ccxt_id(name: str) -> str: return name.strip().lower().replace("-", "").replace("_", "")
def _normalize_symbol(sym: str) -> str: return sym.replace(":", "/").upper()

def _tf_ms(tf: str) -> int:
    n, unit = int(tf[:-1]), tf[-1]
    if unit == "m": return n * 60_000
    if unit == "h": return n * 3_600_000
    if unit == "d": return n * 86_400_000
    raise ValueError(f"Unsupported timeframe: {tf}")

def _align_ts(ts_ms: int, tf_ms: int) -> int:
    return (ts_ms // tf_ms) * tf_ms

def _jitter(v: float, frac: float = 0.2) -> float:
    return max(0.0, v * (1 - frac) + random.random() * v * frac * 2)

async def _fetch_ohlcv_with_retry(
    ex, symbol: str, timeframe: str, limit: int, timeout: float,
    max_retries: int, base_backoff: float, backoff_cap: float
) -> List[List[Any]]:
    last: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        try:
            ex.timeout = int(timeout * 1000)
            return await ex.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
        except Exception as e:
            last = e
            sleep_s = min(backoff_cap, base_backoff * (2 ** attempt))
            sleep_s = _jitter(sleep_s, 0.35)
            log.warning("retry(%s) %s %s %s: %s (sleep=%.2fs)",
                        attempt + 1, ex.id, symbol, timeframe, e, sleep_s)
            await asyncio.sleep(sleep_s)
    assert last is not None
    raise last

def _to_payload(exchange: str, symbol_norm: str, timeframe: str, row: List[Any]) -> Dict[str, Any]:
    ts, o, h, l, c, v = row[:6]
    return {
        "src": exchange,
        "symbol": symbol_norm.replace("/", ""),  # e.g., BTCUSDT
        "tf": timeframe,
        "ts": int(ts),               # candle open time (ms)
        "ingest_ts": _now_ms(),      # when ingested
        "o": float(o), "h": float(h), "l": float(l), "c": float(c),
        "v": float(v),
    }

async def _produce_batch(prod: Producer, topic: str, payloads: List[Dict[str, Any]]) -> None:
    for p in payloads:
        # Validate
        try:
            if not validate_ohlcv(p):
                mark_drop(p.get("src", "unknown"), "validation_failed")
                continue
        except Exception:
            mark_drop(p.get("src", "unknown"), "schema_error")
            continue
        # Produce (attach candle-open timestamp as Kafka timestamp)
        try:
            prod.produce(
                topic,
                p,
                key_fields={"symbol": p["symbol"], "tf": p["tf"]},
                headers={"src": "rest"},
                timestamp_ms=int(p["ts"]),
            )
            mark_msg(p["src"], "ohlcv")
            set_lag(p["src"], max(0, _now_ms() - p["ts"]))
        except Exception as e:
            log.exception("produce failed topic=%s src=%s sym=%s tf=%s", topic, p.get("src"), p.get("symbol"), p.get("tf"))
            mark_drop(p.get("src", "unknown"), f"produce:{type(e).__name__}")

def _mk_exchange(exchange_name: str, timeout_ms: int, keypair: Tuple[Optional[str], Optional[str]]):
    ex_id = _ccxt_id(exchange_name)
    ex_class = getattr(ccxt, ex_id, None)
    if ex_class is None:
        raise RuntimeError(f"Unsupported exchange: {exchange_name}")
    api_key, secret = keypair
    cfg = {
        "enableRateLimit": True,
        "timeout": timeout_ms,
        # Some exchanges need precise specifications; add if needed:
        # "options": { ... }
    }
    if api_key and secret:
        cfg.update({"apiKey": api_key, "secret": secret})
    return ex_class(cfg)

async def _worker(exchange_name: str, symbol: str, timeframe: str, prod: Producer, cfg: Config) -> None:
    # Normalize
    symbol_norm = _normalize_symbol(symbol)
    tf_ms = _tf_ms(timeframe)
    # Build exchange with optional credentials
    ex = _mk_exchange(exchange_name, int(cfg.request_timeout * 1000), cfg.api_keys.get(_ccxt_id(exchange_name), (None, None)))
    log.info("Worker start %s %s %s", ex.id, symbol_norm, timeframe)
    try:
        # Load markets (helps pairs normalization, rate-limits, etc.)
        try:
            await ex.load_markets()
        except Exception as e:
            log.warning("load_markets failed for %s: %s", ex.id, e)

        while True:
            now_ms = _now_ms()
            if cfg.align_to_minute:
                # Fetch just after candle close
                next_tick = _align_ts(now_ms, tf_ms) + tf_ms + 500
                await asyncio.sleep(max(0, next_tick - now_ms) / 1000)

            try:
                rows = await _fetch_ohlcv_with_retry(
                    ex, symbol_norm, timeframe,
                    limit=cfg.batch_candles,
                    timeout=cfg.request_timeout,
                    max_retries=cfg.max_retries,
                    base_backoff=cfg.base_backoff,
                    backoff_cap=cfg.backoff_cap,
                )
            except Exception as e:
                log.error("fetch error %s %s %s: %s", ex.id, symbol_norm, timeframe, e)
                mark_drop(ex.id, "fetch_error")
                await asyncio.sleep(_jitter(1.0, 0.5))
                continue

            if rows:
                payloads = [_to_payload(ex.id, symbol_norm, timeframe, r) for r in rows]
                await _produce_batch(prod, cfg.topic_ohlcv, payloads)
    finally:
        try:
            await ex.close()
        except Exception:
            pass
        log.info("Worker stop %s %s %s", exchange_name, symbol, timeframe)

async def _main_async(cfg: Config) -> None:
    # Metrics
    try:
        start_metrics_server(cfg.metrics_port)
        log.info("Prometheus metrics on :%d", cfg.metrics_port)
    except Exception as e:
        log.warning("metrics server not started: %s", e)

    # Kafka producer
    prod = Producer(bootstrap_servers=cfg.kafka_bootstrap)

    # Concurrency guard
    sem = asyncio.Semaphore(cfg.max_concurrent)

    async def _guarded(ex: str, sym: str, tf: str) -> None:
        async with sem:
            await _worker(ex, sym, tf, prod, cfg)

    # Spawn workers for ALL combinations
    tasks = [asyncio.create_task(_guarded(ex, sym, tf))
             for ex in cfg.exchanges for sym in cfg.symbols for tf in cfg.tfs]

    # Graceful shutdown
    stop = asyncio.Event()
    def _ask_exit() -> None: stop.set()
    for s in ("SIGINT", "SIGTERM"):
        if hasattr(signal, s):
            try:
                asyncio.get_running_loop().add_signal_handler(getattr(signal, s), _ask_exit)
            except NotImplementedError:
                pass

    try:
        await stop.wait()
    except (KeyboardInterrupt, SystemExit):
        log.info("Keyboard interrupt – shutting down …")
    finally:
        for t in tasks: t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        try:
            prod.flush(10.0)
        except Exception:
            pass
        log.info("REST fetcher terminated.")

def main() -> None:
    log.info(
        "Starting REST OHLCV fetcher | exchanges=%s | symbols=%s | tfs=%s | topic=%s | bootstrap=%s",
        CFG.exchanges, CFG.symbols, CFG.tfs, CFG.topic_ohlcv, CFG.kafka_bootstrap
    )
    asyncio.run(_main_async(CFG))

if __name__ == "__main__":
    main()
