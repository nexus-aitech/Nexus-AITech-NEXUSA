"""WebSocket streamer for exchange klines.

Layering note: orchestration نباید مستقیماً به storage/reports وابسته شود.
برای همین، importهای مربوط به ثبت/اعتبارسنجی اسکیما به‌صورت تنبل و داخل توابع انجام شده‌اند.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

import websockets
from core.config.config import settings
# --- BEGIN robust Producer import shim (backward-compatible) ---
try:
    # Preferred new location
    from orchestration.producer import KafkaProducerWrapper as _Producer  # type: ignore
except Exception:  # pragma: no cover - fallback paths
    try:
        from orchestration.producer import Producer as _Producer  # type: ignore
    except Exception:
        try:
            from core.kafka_producer import Producer as _Producer  # legacy path
        except Exception as e:  # final fallback -> hard fail with clear message
            raise ImportError(
                "Cannot import Producer. Tried: "
                "orchestration.producer.KafkaProducerWrapper, "
                "orchestration.producer.Producer, core.kafka_producer.Producer"
            ) from e

# If the imported producer doesn't expose async methods, adapt it.
class Producer(_Producer):  # type: ignore
    async def start(self):  # type: ignore[override]
        s = getattr(super(), "start", None)
        if s is None:
            return None
        res = s()
        if hasattr(res, "__await__"):
            return await res
        return res

    async def stop(self):  # type: ignore[override]
        s = getattr(super(), "stop", None)
        if s is None:
            return None
        res = s()
        if hasattr(res, "__await__"):
            return await res
        return res

    async def send(self, topic, payload, key_fields=()):  # type: ignore[override]
        # normalize interface across different implementations
        key = None
        if key_fields:
            key = "-".join(map(str, key_fields))
            try:
                key = key.encode()
            except Exception:
                pass
        impl_send = getattr(super(), "send", None)
        if impl_send is not None:
            res = impl_send(topic, payload, key_fields=key_fields)  # type: ignore
            if hasattr(res, "__await__"):
                return await res
            return res
        impl_produce = getattr(super(), "produce", None)
        if impl_produce is not None:
            # assume value/key signature (bytes/str accepted by producer)
            return impl_produce(topic, value=payload, key=key)
        raise RuntimeError("Producer lacks send/produce methods")
# --- END robust Producer import shim ---


log = logging.getLogger("ws_streamer")

RAW_TICK_SCHEMA_NAME = "ticks_raw"
RAW_TICK_SCHEMA_V = "2"
RAW_TICK_SCHEMA = {
    "type": "object",
    "required": ["symbol", "exchange", "ts_event", "ingest_ts", "tf", "ohlcv"],
    "properties": {
        "symbol": {"type": "string"},
        "exchange": {"type": "string"},
        "ts_event": {"type": "integer"},
        "ingest_ts": {"type": "integer"},
        "tf": {"type": "string"},
        "ohlcv": {"type": "object"},
    },
    "additionalProperties": True,
}


def _register_raw_schema() -> None:
    """Register raw tick schema lazily to avoid orchestration → storage layer violation."""
    from storage.schema_registry import register  # type: ignore

    register(RAW_TICK_SCHEMA_NAME, RAW_TICK_SCHEMA_V, RAW_TICK_SCHEMA)


def _ensure_payload(payload: dict) -> None:
    """Validate payload lazily to avoid orchestration → reports layer violation."""
    from reports.schema_guard import ensure  # type: ignore

    ensure(RAW_TICK_SCHEMA_NAME, RAW_TICK_SCHEMA_V, payload)


def _get_exchange_conf():
    """
    Safely read exchange configuration for this streamer.
    Prevents hardcoding brand/endpoint; defaults remain backwards-compatible.
    Expected optional structure in settings:
    settings.exchanges.binance.ws_base  -> e.g. "wss://stream.binance.com:9443/ws"
    settings.exchanges.binance.name     -> e.g. "binance"
    """
    # Backward-safe defaults (no secrets)
    ws_base_default = "wss://stream.binance.com:9443/ws"
    name_default = "binance"

    ws_base = ws_base_default
    name = name_default

    try:
        # Attribute-style access (pydantic BaseSettings commonly used)
        ex = getattr(settings, "exchanges", None)
        if ex is not None:
            b = getattr(ex, "binance", None)
            if b is not None:
                ws_base = getattr(b, "ws_base", ws_base_default) or ws_base_default
                name = getattr(b, "name", name_default) or name_default
    except Exception:
        # Fall back to defaults silently; we don't want config errors to crash import
        pass

    # Normalize
    ws_base = ws_base.rstrip("/")
    name = str(name).strip()
    return ws_base, name or name_default


async def binance_kline(symbol: str, channel: str) -> None:
    """Stream kline messages from the configured Binance endpoint, validate, and publish to Kafka.

    Args:
        symbol: instrument symbol (e.g., 'btcusdt').
        channel: kline channel (e.g., 'kline_1m').
    """
    ws_base, exchange_name = _get_exchange_conf()
    url = f"{ws_base}/{symbol}@{channel}"

    # Lazy schema registration (first use).
    _register_raw_schema()

    prod = Producer()
    await prod.start()
    try:
        async with websockets.connect(url, ping_interval=20) as ws:
            async for msg in ws:
                d = json.loads(msg)
                k = d.get("k", {})
                payload = {
                    "symbol": (k.get("s", symbol) or "").lower(),
                    "exchange": exchange_name,
                    "ts_event": int(k.get("t", int(time.time() * 1000))),
                    "ingest_ts": int(time.time() * 1000),
                    "tf": k.get("i", "1m"),
                    "ohlcv": {
                        "o": float(k.get("o", 0)),
                        "h": float(k.get("h", 0)),
                        "l": float(k.get("l", 0)),
                        "c": float(k.get("c", 0)),
                        "v": float(k.get("q", 0)),
                    },
                }
                _ensure_payload(payload)
                await prod.send(
                    settings.kafka.topic_ticks_raw,
                    payload,
                    key_fields=(payload["symbol"], payload["tf"], payload["ts_event"]),
                )
    finally:
        await prod.stop()


if __name__ == "__main__":
    import argparse
    from telemetry import setup_logging

    setup_logging()
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", default="btcusdt")
    ap.add_argument("--channel", default="kline_1m")
    args = ap.parse_args()
    asyncio.run(binance_kline(args.symbol, args.channel))
