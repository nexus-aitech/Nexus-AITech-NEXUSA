"""WebSocket consumer for exchange streams.

- Adds optional Prometheus/OpenTelemetry metrics on the critical path
  (connections, messages, errors, reconnect backoff, connect duration).
- Preserves original behavior and public API.
- All metrics are no-ops if Prometheus/OTel are not installed.
"""
from __future__ import annotations
import aiohttp
import asyncio
import json
import ssl
import hashlib
import logging
import random
import time
from time import perf_counter
from typing import Any, AsyncIterator, Callable, Dict, Optional

# ----------------------- Optional Observability ------------------------------
try:
    from prometheus_client import Counter, Histogram  # type: ignore
except Exception:
    Counter = None  # type: ignore
    Histogram = None  # type: ignore

try:
    from opentelemetry import metrics as otel_metrics  # type: ignore
    _otel_meter = getattr(otel_metrics, "get_meter", lambda name: None)(__name__)
except Exception:
    _otel_meter = None  # type: ignore

# Prometheus instruments
if Counter and Histogram:
    try:
        WS_CONNECTS_TOTAL = Counter("ws_connects_total", "Successful WS connections.", ["source"])
        WS_RECONNECTS_TOTAL = Counter("ws_reconnects_total", "Reconnect attempts.", ["source"])
        WS_ERRORS_TOTAL = Counter("ws_errors_total", "WebSocket errors.", ["source"])
        WS_MSGS_TOTAL = Counter("ws_msgs_total", "Messages received.", ["source"])
        WS_CONNECT_DURATION = Histogram(
            "ws_connect_duration_seconds",
            "Seconds spent establishing a WS connection.",
            buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
        )
    except Exception:
        WS_CONNECTS_TOTAL = WS_RECONNECTS_TOTAL = WS_ERRORS_TOTAL = WS_MSGS_TOTAL = None  # type: ignore
        WS_CONNECT_DURATION = None  # type: ignore
else:
    WS_CONNECTS_TOTAL = WS_RECONNECTS_TOTAL = WS_ERRORS_TOTAL = WS_MSGS_TOTAL = None  # type: ignore
    WS_CONNECT_DURATION = None  # type: ignore

# OpenTelemetry instruments
try:
    _otel_connects = _otel_meter.create_counter("ws.connects.total") if _otel_meter else None
    _otel_reconnects = _otel_meter.create_counter("ws.reconnects.total") if _otel_meter else None
    _otel_errors = _otel_meter.create_counter("ws.errors.total") if _otel_meter else None
    _otel_msgs = _otel_meter.create_counter("ws.msgs.total") if _otel_meter else None
    _otel_connect_duration = _otel_meter.create_histogram("ws.connect.duration.seconds") if _otel_meter else None
except Exception:
    _otel_connects = _otel_reconnects = _otel_errors = _otel_msgs = None  # type: ignore
    _otel_connect_duration = None  # type: ignore
# -----------------------------------------------------------------------------


log = logging.getLogger("nexusa.ingestion.websocket_consumer")
logging.basicConfig(level=logging.INFO)

NormalizedEvent = Dict[str, Any]
ParserFn = Callable[[Dict[str, Any]], Optional[NormalizedEvent]]


def _now_ms() -> int:
    """Return current wall-clock time in milliseconds."""
    return int(time.time() * 1000)


def _sha256_hex(data: bytes) -> str:
    """Return hex-encoded SHA-256 of the given bytes."""
    return hashlib.sha256(data).hexdigest()


def default_parser(msg: Dict[str, Any]) -> Optional[NormalizedEvent]:
    """
    Try to map a generic exchange ws payload to a normalized ingest schema v2:
    {
      "v": 2, "source": "__EXCHANGE_NAME__", "event_type": "tick|ohlcv|funding|oi",
      "symbol": "BTCUSDT", "tf": "1m"|None, "ts_event": 1700000000123,
      "ingest_ts": 1700000000456, "correlation_id": "...", "payload": {...}
    }
    Heuristics are intentionally minimal; override with a custom parser for each source.
    """
    etype = None
    tf = None
    symbol = msg.get("s") or msg.get("symbol") or msg.get("pair") or msg.get("market")
    if "k" in msg and isinstance(msg.get("k"), dict):  # kline
        etype = "ohlcv"
        k = msg["k"]
        tf = k.get("i") or msg.get("interval")
        ts_event = k.get("T") or k.get("t") or msg.get("E") or _now_ms()
    elif "p" in msg and "q" in msg and "T" in msg:
        etype = "tick"
        ts_event = msg.get("T") or msg.get("E") or _now_ms()
    elif "fundingRate" in msg or "r" in msg:
        etype = "funding"
        ts_event = msg.get("E") or msg.get("T") or _now_ms()
    elif "openInterest" in msg or "oi" in msg:
        etype = "oi"
        ts_event = msg.get("E") or msg.get("T") or _now_ms()
    else:
        return None

    ingest_ts = _now_ms()
    base = f"{symbol}|{etype}|{ts_event}"
    correlation_id = _sha256_hex(base.encode("utf-8"))
    return {
        "v": 2,
        "source": "ws",
        "event_type": etype,
        "symbol": symbol,
        "tf": tf,
        "ts_event": ts_event,
        "ingest_ts": ingest_ts,
        "correlation_id": correlation_id,
        "payload": msg,
    }


class WebSocketConsumer:
    """
    Robust async WebSocket consumer with:
    - Reconnect w/ exponential backoff + jitter
    - Optional TLS certificate pinning (sha256 fingerprint)
    - Heartbeats/keepalive
    - Pluggable parser mapping raw json -> normalized event
    Yields normalized events via async iterator.
    """

    def __init__(
        self,
        url: str,
        source_name: str,
        parser: ParserFn = default_parser,
        headers: Optional[Dict[str, str]] = None,
        tls_fingerprint_sha256: Optional[str] = None,
        ping_interval: float = 20.0,
        max_backoff: float = 60.0,
        session: Optional[aiohttp.ClientSession] = None,
    ) -> None:
        """Initialize the consumer and basic connection/backoff settings."""
        self.url = url
        self.source_name = source_name
        self.parser = parser
        self.headers = headers or {}
        self.tls_fingerprint_sha256 = tls_fingerprint_sha256.lower() if tls_fingerprint_sha256 else None
        self.ping_interval = ping_interval
        self.max_backoff = max_backoff
        self._session = session
        self._closed = False

    def _ssl_context(self) -> Optional[ssl.SSLContext]:
        """Build a default SSLContext if TLS pinning is enabled; else return None."""
        if self.tls_fingerprint_sha256 is None:
            return None
        # Use default context; we'll verify fingerprint post-handshake
        ctx = ssl.create_default_context()
        return ctx

    async def _verify_pin(self, transport: asyncio.Transport) -> None:
        """Verify TLS certificate fingerprint (sha256) against the configured pin."""
        if self.tls_fingerprint_sha256 is None:
            return
        sslobj = transport.get_extra_info("ssl_object")
        if sslobj is None:
            raise ssl.SSLError("TLS expected but not negotiated")
        der = sslobj.getpeercert(binary_form=True)
        fp = hashlib.sha256(der).hexdigest().lower()
        if fp != self.tls_fingerprint_sha256:
            raise ssl.SSLError(f"TLS pin mismatch; got {fp}, expected {self.tls_fingerprint_sha256}")

    async def _iter(self) -> AsyncIterator[NormalizedEvent]:
        """Connect, receive frames, parse, and yield normalized events with auto-reconnect."""
        backoff = 1.0
        session = self._session or aiohttp.ClientSession()
        try:
            while not self._closed:
                try:
                    t0 = perf_counter()
                    async with session.ws_connect(
                        self.url, headers=self.headers, ssl=self._ssl_context(), heartbeat=self.ping_interval
                    ) as ws:
                        # TLS pin verification
                        await self._verify_pin(ws._response.connection.transport)  # type: ignore

                        # Metrics: successful connect
                        dt_conn = perf_counter() - t0
                        if WS_CONNECT_DURATION is not None:
                            try:
                                WS_CONNECT_DURATION.observe(dt_conn)
                            except Exception:
                                pass
                        if _otel_connect_duration is not None:
                            try:
                                _otel_connect_duration.record(dt_conn, {"source": self.source_name})  # type: ignore[arg-type]
                            except Exception:
                                pass
                        if WS_CONNECTS_TOTAL is not None:
                            try:
                                WS_CONNECTS_TOTAL.labels(self.source_name).inc()
                            except Exception:
                                pass
                        if _otel_connects is not None:
                            try:
                                _otel_connects.add(1, {"source": self.source_name})  # type: ignore[arg-type]
                            except Exception:
                                pass

                        log.info("Connected to %s", self.url)
                        backoff = 1.0
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                try:
                                    raw = json.loads(msg.data)
                                except Exception:
                                    if WS_ERRORS_TOTAL is not None:
                                        try:
                                            WS_ERRORS_TOTAL.labels(self.source_name).inc()
                                        except Exception:
                                            pass
                                    if _otel_errors is not None:
                                        try:
                                            _otel_errors.add(1, {"source": self.source_name})  # type: ignore[arg-type]
                                        except Exception:
                                            pass
                                    log.exception("Invalid JSON from %s", self.source_name)
                                    continue
                                normalized = self.parser(raw)
                                if normalized:
                                    normalized["source"] = self.source_name
                                    if WS_MSGS_TOTAL is not None:
                                        try:
                                            WS_MSGS_TOTAL.labels(self.source_name).inc()
                                        except Exception:
                                            pass
                                    if _otel_msgs is not None:
                                        try:
                                            _otel_msgs.add(1, {"source": self.source_name})  # type: ignore[arg-type]
                                        except Exception:
                                            pass
                                    yield normalized
                            elif msg.type == aiohttp.WSMsgType.BINARY:
                                # user may override parser to handle binary frames
                                continue
                            elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                                break
                except Exception as e:
                    if WS_ERRORS_TOTAL is not None:
                        try:
                            WS_ERRORS_TOTAL.labels(self.source_name).inc()
                        except Exception:
                            pass
                    if _otel_errors is not None:
                        try:
                            _otel_errors.add(1, {"source": self.source_name})  # type: ignore[arg-type]
                        except Exception:
                            pass
                    if WS_RECONNECTS_TOTAL is not None:
                        try:
                            WS_RECONNECTS_TOTAL.labels(self.source_name).inc()
                        except Exception:
                            pass
                    if _otel_reconnects is not None:
                        try:
                            _otel_reconnects.add(1, {"source": self.source_name})  # type: ignore[arg-type]
                        except Exception:
                            pass
                    jitter = random.uniform(0, 0.5)
                    sleep_for = min(self.max_backoff, backoff) + jitter
                    log.warning("WS error (%s). Reconnecting in %.2fs", str(e), sleep_for)
                    await asyncio.sleep(sleep_for)
                    backoff = min(self.max_backoff, backoff * 2)
        finally:
            if self._session is None:
                await session.close()

    def close(self) -> None:
        """Signal the consumer loop to stop and close the session on exit."""
        self._closed = True

    def __aiter__(self) -> AsyncIterator[NormalizedEvent]:
        """Return the async iterator that yields normalized events."""
        return self._iter()
