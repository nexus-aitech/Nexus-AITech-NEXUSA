"""Signals package instrumentation.

Provides Prometheus-compatible counters/histograms (with graceful no-op fallback)
to track signal processing volume, errors, and latency on the critical path.
Use `track_latency("my_signal")` around processing blocks and call
`record_processed` / `record_error` where appropriate.
"""

from contextlib import contextmanager
import time

# --- Prometheus fallback-safe shims -------------------------------------------------
try:
    from prometheus_client import Counter, Histogram  # type: ignore
except Exception:  # pragma: no cover
    class _NoopMetric:
        def __init__(self, *_args, **_kwargs): ...
        def labels(self, **_labels): return self
        def inc(self, *_args, **_kwargs): ...
        def observe(self, *_args, **_kwargs): ...
    Counter = Histogram = _NoopMetric  # type: ignore

# --- Metrics -----------------------------------------------------------------------
SIGNALS_PROCESSED = Counter(
    "signals_processed_total",
    "Total number of processed signals.",
    ["signal_type"],
)
SIGNALS_ERRORS = Counter(
    "signals_errors_total",
    "Total number of signal processing errors.",
    ["signal_type"],
)
SIGNAL_LATENCY = Histogram(
    "signal_latency_seconds",
    "Signal processing latency in seconds.",
    ["signal_type"],
)

# --- Helpers -----------------------------------------------------------------------
def record_processed(signal_type: str) -> None:
    """Increment processed counter for a given signal type."""
    SIGNALS_PROCESSED.labels(signal_type=signal_type).inc()


def record_error(signal_type: str) -> None:
    """Increment error counter for a given signal type."""
    SIGNALS_ERRORS.labels(signal_type=signal_type).inc()


def observe_latency(signal_type: str, seconds: float) -> None:
    """Record latency observation for a given signal type."""
    SIGNAL_LATENCY.labels(signal_type=signal_type).observe(seconds)


@contextmanager
def track_latency(signal_type: str):
    """Context manager to auto-measure processing latency for a signal."""
    _t0 = time.perf_counter()
    try:
        yield
    finally:
        observe_latency(signal_type, time.perf_counter() - _t0)


__all__ = [
    "SIGNALS_PROCESSED",
    "SIGNALS_ERRORS",
    "SIGNAL_LATENCY",
    "record_processed",
    "record_error",
    "observe_latency",
    "track_latency",
]
