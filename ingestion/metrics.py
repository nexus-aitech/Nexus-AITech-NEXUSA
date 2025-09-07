"""
Prometheus metrics for the ingestion layer.
Expose with: start_metrics_server(port=9108)
"""
from typing import Optional
from prometheus_client import Counter, Gauge, Histogram, Summary, start_http_server

# Message rate by source and type (tick, ohlcv, funding, oi, etc.)
msg_total = Counter(
    "ingest_msg_total",
    "Total number of messages ingested",
    ["source", "event_type"],
)

# Approximate producer queue length (set by ingestion manager)
producer_queue_len = Gauge(
    "ingest_producer_queue_len",
    "Kafka producer local queue length",
)

# Estimated upstream lag for a source in milliseconds (e.g., server_ts -> ingest_ts)
lag_ms = Gauge(
    "ingest_lag_ms",
    "Estimated event lag in milliseconds between ts_event and ingest_ts",
    ["source"],
)

# Dropped messages (e.g., schema invalid, duplicate, backpressure drop, etc.)
dropped_total = Counter(
    "ingest_dropped_total",
    "Total number of dropped messages",
    ["source", "reason"],
)

# Batch size the manager is currently using (adaptive)
batch_size = Gauge(
    "ingest_batch_size",
    "Current adaptive batch size used by ingestion manager",
)

# Kafka delivery latency (send->acked) in milliseconds
delivery_latency_ms = Histogram(
    "kafka_delivery_latency_ms",
    "Kafka delivery latency in ms (send to ack)",
    buckets=(1, 2, 5, 10, 20, 50, 100, 250, 500, 1000, 2000, 5000)
)

def start_metrics_server(port: int = 9108) -> None:
    """Start Prometheus metrics HTTP server on the given port."""
    start_http_server(port)

def mark_msg(source: str, event_type: str) -> None:
    """Increment the ingested message counter for a given source and event type."""
    msg_total.labels(source=source, event_type=event_type).inc()

def mark_drop(source: str, reason: str) -> None:
    """Increment the dropped message counter with a specific drop reason."""
    dropped_total.labels(source=source, reason=reason).inc()

def set_lag(source: str, lag_millis: float) -> None:
    """Set the current lag (ms) between ts_event and ingest_ts for a source."""
    lag_ms.labels(source=source).set(lag_millis)

def set_queue_len(n: int) -> None:
    """Set the current Kafka producer local queue length gauge."""
    producer_queue_len.set(n)

def set_batch_size(n: int) -> None:
    """Set the current adaptive batch size used by the ingestion manager."""
    batch_size.set(n)

def observe_delivery_latency_ms(value: float) -> None:
    """Record a Kafka delivery latency observation in milliseconds."""
    delivery_latency_ms.observe(value)
