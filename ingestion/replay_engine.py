"""Replay Engine for historical events.

- Adds optional Prometheus/OpenTelemetry metrics on the critical path.
- Preserves original behavior: read Parquet rows, reconstruct normalized events,
  and produce to Kafka using the original ts_event as the message timestamp.

If Prometheus or OpenTelemetry are not installed/configured, all metrics calls are no-ops.
"""
from __future__ import annotations
import json
import logging
import time
from time import perf_counter
from typing import Optional, Dict, Any, Iterable

# Optional dependencies for Parquet
try:
    import pyarrow.parquet as pq
    import pyarrow as pa
except Exception as e:  # pragma: no cover
    pq = None
    pa = None

# Optional observability -------------------------------------------------------
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
        REPLAY_EVENTS_TOTAL = Counter(
            "replay_events_total", "Total number of events replayed to Kafka."
        )
        REPLAY_FILES_TOTAL = Counter(
            "replay_files_total", "Total number of parquet files processed."
        )
        REPLAY_PARSE_ERRORS = Counter(
            "replay_parse_errors_total", "Number of rows that failed to parse/build."
        )
        REPLAY_DURATION = Histogram(
            "replay_duration_seconds",
            "Wall-clock seconds spent in ReplayEngine.replay_parquet()",
            buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60),
        )
    except Exception:
        REPLAY_EVENTS_TOTAL = REPLAY_FILES_TOTAL = REPLAY_PARSE_ERRORS = None  # type: ignore
        REPLAY_DURATION = None  # type: ignore
else:
    REPLAY_EVENTS_TOTAL = REPLAY_FILES_TOTAL = REPLAY_PARSE_ERRORS = None  # type: ignore
    REPLAY_DURATION = None  # type: ignore

# OpenTelemetry instruments
try:
    _otel_replay_events = _otel_meter.create_counter("replay.events.total") if _otel_meter else None
    _otel_replay_files = _otel_meter.create_counter("replay.files.total") if _otel_meter else None
    _otel_replay_parse_errors = _otel_meter.create_counter("replay.parse.errors") if _otel_meter else None
    _otel_replay_duration = _otel_meter.create_histogram("replay.duration.seconds") if _otel_meter else None
except Exception:
    _otel_replay_events = _otel_replay_files = _otel_replay_parse_errors = None  # type: ignore
    _otel_replay_duration = None  # type: ignore
# -----------------------------------------------------------------------------


from ..core.kafka_producer import KafkaProducerWrapper  # keep original import path

log = logging.getLogger("nexusa.ingestion.replay_engine")
logging.basicConfig(level=logging.INFO)


class ReplayEngine:
    """
    Replays historical normalized events from Parquet files and republishes to Kafka
    while preserving the original `ts_event` as the Kafka message timestamp.

    Expected Parquet schema columns for each row:
      - `event` (JSON string), OR individual columns matching normalized schema keys:
        v, source, event_type, symbol, tf, ts_event, ingest_ts, correlation_id, payload (JSON string or struct)
    """

    def __init__(
        self,
        producer: KafkaProducerWrapper,
        topic: str,
        source_name: str = "replay",
    ) -> None:
        """Initialize the replay engine with a Kafka producer, target topic, and default source name."""
        self._producer = producer
        self._topic = topic
        self._source_name = source_name

    def _row_to_event(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """Convert a Parquet row into a normalized event dict (schema v2-compatible)."""
        if "event" in row and isinstance(row["event"], (str, bytes)):
            ev = json.loads(row["event"] if isinstance(row["event"], str) else row["event"].decode("utf-8"))
            return ev
        # Build from columns
        payload = row.get("payload")
        if isinstance(payload, (bytes, str)):
            try:
                payload = json.loads(payload if isinstance(payload, str) else payload.decode("utf-8"))
            except Exception:
                pass
        ev = {
            "v": row.get("v", 2),
            "source": row.get("source", self._source_name),
            "event_type": row.get("event_type"),
            "symbol": row.get("symbol"),
            "tf": row.get("tf"),
            "ts_event": int(row.get("ts_event", int(time.time() * 1000))),
            "ingest_ts": int(row.get("ingest_ts", int(time.time() * 1000))),
            "correlation_id": row.get("correlation_id"),
            "payload": payload,
        }
        return ev

    def replay_parquet(self, paths: Iterable[str]) -> int:
        """Read one or more Parquet files, reconstruct events, and produce them to Kafka. Returns number of events."""
        if pq is None:
            raise RuntimeError("pyarrow is required for ReplayEngine.replay_parquet")

        t0 = perf_counter()
        count = 0

        for path in paths:
            if REPLAY_FILES_TOTAL is not None:
                try:
                    REPLAY_FILES_TOTAL.inc()
                except Exception:
                    pass
            if _otel_replay_files is not None:
                try:
                    _otel_replay_files.add(1)
                except Exception:
                    pass

            table = pq.read_table(path)
            for batch in table.to_batches():
                recs = batch.to_pylist()
                for row in recs:
                    try:
                        ev = self._row_to_event(row)
                    except Exception:
                        # parsing/build failure
                        if REPLAY_PARSE_ERRORS is not None:
                            try:
                                REPLAY_PARSE_ERRORS.inc()
                            except Exception:
                                pass
                        if _otel_replay_parse_errors is not None:
                            try:
                                _otel_replay_parse_errors.add(1)
                            except Exception:
                                pass
                        log.exception("Failed to parse row during replay (path=%s)", path)
                        continue

                    ts_ms = int(ev.get("ts_event") or int(time.time() * 1000))
                    key_fields = {"symbol": ev.get("symbol"), "tf": ev.get("tf")}
                    self._producer.produce(self._topic, ev, key_fields=key_fields, timestamp_ms=ts_ms)

                    count += 1
                    if REPLAY_EVENTS_TOTAL is not None:
                        try:
                            REPLAY_EVENTS_TOTAL.inc()
                        except Exception:
                            pass
                    if _otel_replay_events is not None:
                        try:
                            _otel_replay_events.add(1)
                        except Exception:
                            pass

        self._producer.flush()
        dt = perf_counter() - t0
        if REPLAY_DURATION is not None:
            try:
                REPLAY_DURATION.observe(dt)
            except Exception:
                pass
        if _otel_replay_duration is not None:
            try:
                _otel_replay_duration.record(dt)
            except Exception:
                pass

        log.info("Replayed %d events to topic=%s in %.3fs", count, self._topic, dt)
        return count
