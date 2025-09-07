"""Ingestion Manager.

Coordinates multiple real-time sources (e.g., WebSockets), applies deduplication,
adaptive batching, and publishes to Kafka. Adds lightweight, optional
observability (Prometheus & OpenTelemetry) on the critical path. If the metric
libraries are missing, all observability calls are no-ops.
"""
from __future__ import annotations
import asyncio
import time
import logging
import hashlib
from collections import OrderedDict, deque
from typing import Any, Dict, List, Optional, Deque, Tuple
from ingestion.metrics import mark_msg, mark_drop, set_lag, set_batch_size
from core.kafka_producer import KafkaProducerWrapper
from ingestion.websocket_consumer import WebSocketConsumer, NormalizedEvent

# ---------- Optional Observability -------------------------------------------
try:
    from prometheus_client import Counter, Histogram  # type: ignore
except Exception:  # Prometheus not installed / unavailable
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
        BATCHES_TOTAL = Counter("ing_batches_total", "Number of flushed batches.")
        PRODUCED_TOTAL = Counter("ing_produced_total", "Number of events produced to Kafka.")
        DLT_TOTAL = Counter("ing_dlt_total", "Number of events routed to DLT.")
        DUPLICATES_TOTAL = Counter("ing_duplicates_total", "Number of dropped duplicate events.")
        VALIDATION_FAILED_TOTAL = Counter("ing_validation_failed_total", "Events failing validation.")
        QUEUE_GET_LATENCY = Histogram(
            "ing_queue_get_latency_seconds",
            "Seconds waiting for event from internal queue.",
            buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5),
        )
        BATCH_FLUSH_DURATION = Histogram(
            "ing_batch_flush_duration_seconds",
            "Seconds spent producing a batch to Kafka.",
            buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
        )
    except Exception:
        BATCHES_TOTAL = PRODUCED_TOTAL = DLT_TOTAL = DUPLICATES_TOTAL = VALIDATION_FAILED_TOTAL = None  # type: ignore
        QUEUE_GET_LATENCY = BATCH_FLUSH_DURATION = None  # type: ignore
else:
    BATCHES_TOTAL = PRODUCED_TOTAL = DLT_TOTAL = DUPLICATES_TOTAL = VALIDATION_FAILED_TOTAL = None  # type: ignore
    QUEUE_GET_LATENCY = BATCH_FLUSH_DURATION = None  # type: ignore

# OpenTelemetry instruments
try:
    _otel_batches = _otel_meter.create_counter("ing.batches.total") if _otel_meter else None
    _otel_produced = _otel_meter.create_counter("ing.produced.total") if _otel_meter else None
    _otel_dlt = _otel_meter.create_counter("ing.dlt.total") if _otel_meter else None
    _otel_dupes = _otel_meter.create_counter("ing.duplicates.total") if _otel_meter else None
    _otel_validation_failed = _otel_meter.create_counter("ing.validation.failed.total") if _otel_meter else None
    _otel_queue_get_latency = _otel_meter.create_histogram("ing.queue.get.latency") if _otel_meter else None
    _otel_batch_flush_duration = _otel_meter.create_histogram("ing.batch.flush.duration") if _otel_meter else None
except Exception:
    _otel_batches = _otel_produced = _otel_dlt = _otel_dupes = _otel_validation_failed = None  # type: ignore
    _otel_queue_get_latency = _otel_batch_flush_duration = None  # type: ignore
# -----------------------------------------------------------------------------

log = logging.getLogger("nexusa.ingestion.manager")
logging.basicConfig(level=logging.INFO)


def _now_ms() -> int:
    """Return current wall-clock time in milliseconds (int)."""
    return int(time.time() * 1000)


class LRUWithTTL:
    """Simple LRU set with TTL for dedupe via correlation_id."""

    def __init__(self, maxsize: int = 100_000, ttl_sec: int = 600) -> None:
        """Initialize the LRU with a maximum size and TTL in seconds."""
        self.maxsize = maxsize
        self.ttl = ttl_sec
        self._store: OrderedDict[str, int] = OrderedDict()

    def add(self, key: str) -> None:
        """Add or refresh a key timestamp; evict the oldest if over capacity."""
        now = int(time.time())
        self._store[key] = now
        self._store.move_to_end(key)
        if len(self._store) > self.maxsize:
            self._store.popitem(last=False)

    def contains(self, key: str) -> bool:
        """Return True if key exists and not expired; refresh recency."""
        now = int(time.time())
        ts = self._store.get(key)
        if ts is None:
            return False
        if now - ts > self.ttl:
            try:
                del self._store[key]
            except KeyError:
                pass
            return False
        self._store.move_to_end(key)
        return True


class IngestionManager:
    """
    Orchestrates multiple ingestion sources (e.g., WebSockets), performs:
    - Adaptive batching with lag-aware backpressure
    - Deduplication via correlation_id LRU
    - Publish to Kafka with idempotent producer
    - Dead-Letter routing on schema/produce failure
    - Clock sync (ts_event vs ingest_ts) metrics
    """

    def __init__(
        self,
        producer: KafkaProducerWrapper,
        topic: str,
        dlt_reason_schema_invalid: str = "schema_invalid",
        high_watermark_queue: int = 50000,
        low_watermark_queue: int = 5000,
        min_batch: int = 50,
        max_batch: int = 5000,
        max_batch_latency_ms: int = 800,
    ) -> None:
        """Configure producer/topic, dedupe, hysteresis thresholds, and batch size bounds."""
        self._producer = producer
        self._topic = topic
        self._sources: List[WebSocketConsumer] = []
        self._dedupe = LRUWithTTL(maxsize=250_000, ttl_sec=1800)
        self._high_wm = high_watermark_queue
        self._low_wm = low_watermark_queue
        self._min_batch = min_batch
        self._max_batch = max_batch
        self._max_batch_latency_ms = max_batch_latency_ms

        self._current_batch_size = min_batch

    def register_ws(self, ws: WebSocketConsumer) -> None:
        """Register a WebSocketConsumer as an active ingestion source."""
        self._sources.append(ws)

    def _validate(self, ev: NormalizedEvent) -> bool:
        """Basic schema checks for ingest schema v2; returns True if valid."""
        req = ["v", "source", "event_type", "symbol", "ts_event", "ingest_ts", "correlation_id", "payload"]
        for k in req:
            if k not in ev or ev[k] is None:
                if VALIDATION_FAILED_TOTAL is not None:
                    try:
                        VALIDATION_FAILED_TOTAL.inc()
                    except Exception:
                        pass
                if _otel_validation_failed is not None:
                    try:
                        _otel_validation_failed.add(1)
                    except Exception:
                        pass
                return False
        if not isinstance(ev["ts_event"], int):
            if VALIDATION_FAILED_TOTAL is not None:
                try:
                    VALIDATION_FAILED_TOTAL.inc()
                except Exception:
                    pass
            if _otel_validation_failed is not None:
                try:
                    _otel_validation_failed.add(1)
                except Exception:
                    pass
            return False
        return True

    async def _collect_events(self, queue: asyncio.Queue) -> None:
        """Collect events from all sources into an internal queue."""
        async def pump(ws: WebSocketConsumer) -> None:
            """Iterate each WebSocketConsumer and enqueue normalized events."""
            async for ev in ws:
                await queue.put(ev)

        tasks = [asyncio.create_task(pump(ws)) for ws in self._sources]
        try:
            await asyncio.gather(*tasks)
        finally:
            for t in tasks:
                t.cancel()

    def _adjust_batch_size(self, qlen: int) -> None:
        """Hysteresis rule: shrink batch on high load; grow when load subsides."""
        if qlen >= self._high_wm:
            self._current_batch_size = max(self._min_batch, self._current_batch_size // 2)
        elif qlen <= self._low_wm:
            self._current_batch_size = min(self._max_batch, int(self._current_batch_size * 1.5))
        set_batch_size(self._current_batch_size)

    async def run(self) -> None:
        """Main loop: collect, dedupe, validate, batch, and publish to Kafka."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100_000)
        collector = asyncio.create_task(self._collect_events(queue))

        batch: List[NormalizedEvent] = []
        batch_started_ms = _now_ms()

        try:
            while True:
                t0 = time.perf_counter()
                try:
                    ev = await asyncio.wait_for(queue.get(), timeout=0.2)
                except asyncio.TimeoutError:
                    ev = None
                dt = time.perf_counter() - t0
                if QUEUE_GET_LATENCY is not None:
                    try:
                        QUEUE_GET_LATENCY.observe(dt)
                    except Exception:
                        pass
                if _otel_queue_get_latency is not None:
                    try:
                        _otel_queue_get_latency.record(dt)
                    except Exception:
                        pass

                now_ms = _now_ms()

                if ev is not None:
                    # Deduplication
                    cid = str(ev.get("correlation_id"))
                    if self._dedupe.contains(cid):
                        mark_drop(ev.get("source", "unknown"), "duplicate_correlation_id")
                        if DUPLICATES_TOTAL is not None:
                            try:
                                DUPLICATES_TOTAL.inc()
                            except Exception:
                                pass
                        if _otel_dupes is not None:
                            try:
                                _otel_dupes.add(1)
                            except Exception:
                                pass
                        continue
                    self._dedupe.add(cid)

                    # lag metric
                    try:
                        lag = max(0, now_ms - int(ev.get("ts_event", now_ms)))
                        set_lag(ev.get("source", "unknown"), lag)
                    except Exception:
                        pass

                    # Minimal fixups
                    ev.setdefault("ingest_ts", now_ms)

                    # Validate (drop to DLT if invalid)
                    if not self._validate(ev):
                        try:
                            raw = (str(ev)).encode("utf-8")
                            self._producer.produce_to_dlt(self._topic, raw, reason="schema_invalid",
                                                          headers={"correlation_id": ev.get("correlation_id", "")})
                        except Exception:
                            log.exception("Failed to publish invalid schema to DLT")
                        mark_drop(ev.get("source", "unknown"), "schema_invalid")
                        if DLT_TOTAL is not None:
                            try:
                                DLT_TOTAL.inc()
                            except Exception:
                                pass
                        if _otel_dlt is not None:
                            try:
                                _otel_dlt.add(1)
                            except Exception:
                                pass
                        continue

                    mark_msg(ev.get("source", "unknown"), ev.get("event_type", "unknown"))
                    batch.append(ev)

                should_flush = False
                if len(batch) >= self._current_batch_size:
                    should_flush = True
                elif ev is None and batch and (now_ms - batch_started_ms >= self._max_batch_latency_ms):
                    should_flush = True

                if should_flush and batch:
                    # backpressure-aware adapt
                    self._adjust_batch_size(qlen=-1)  # we set -1; queue len metric populated by producer

                    t_flush0 = time.perf_counter()
                    for item in batch:
                        key_fields = {"symbol": item.get("symbol"), "tf": item.get("tf")}
                        try:
                            self._producer.produce(
                                topic=self._topic,
                                value=item,
                                key_fields=key_fields,
                                headers={"correlation_id": item.get("correlation_id", "")},
                                timestamp_ms=int(item.get("ts_event") or now_ms),
                            )
                            if PRODUCED_TOTAL is not None:
                                try:
                                    PRODUCED_TOTAL.inc()
                                except Exception:
                                    pass
                            if _otel_produced is not None:
                                try:
                                    _otel_produced.add(1)
                                except Exception:
                                    pass
                        except Exception:
                            # DLT route and continue
                            try:
                                raw = (str(item)).encode("utf-8")
                                self._producer.produce_to_dlt(
                                    self._topic, raw, reason="produce_failed",
                                    headers={"correlation_id": item.get("correlation_id", "")},
                                )
                            except Exception:
                                log.exception("Failed to publish to DLT")
                            mark_drop(item.get("source", "unknown"), "produce_failed")
                            if DLT_TOTAL is not None:
                                try:
                                    DLT_TOTAL.inc()
                                except Exception:
                                    pass
                            if _otel_dlt is not None:
                                try:
                                    _otel_dlt.add(1)
                                except Exception:
                                    pass

                    self._producer.flush(0.5)
                    t_flush = time.perf_counter() - t_flush0
                    if BATCH_FLUSH_DURATION is not None:
                        try:
                            BATCH_FLUSH_DURATION.observe(t_flush)
                        except Exception:
                            pass
                    if _otel_batch_flush_duration is not None:
                        try:
                            _otel_batch_flush_duration.record(t_flush)
                        except Exception:
                            pass
                    if BATCHES_TOTAL is not None:
                        try:
                            BATCHES_TOTAL.inc()
                        except Exception:
                            pass
                    if _otel_batches is not None:
                        try:
                            _otel_batches.add(1)
                        except Exception:
                            pass

                    batch.clear()
                    batch_started_ms = now_ms

        finally:
            collector.cancel()
            try:
                await collector
            except Exception:
                pass
