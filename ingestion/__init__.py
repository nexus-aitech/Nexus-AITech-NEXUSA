"""
ingestion package.

This module adds lightweight, optional observability on the package critical path:
- Prometheus: `ingestion_module_imports_total` (Counter), `ingestion_init_duration_seconds` (Histogram)
- OpenTelemetry: `ingestion.module.imports` (Counter), `ingestion.init.duration` (Histogram)

If Prometheus or OpenTelemetry are not installed/configured, the fallbacks are no-ops.
The public surface remains unchanged; these are additive and safe.
"""
from time import perf_counter

# --- Optional Prometheus instruments --------------------------------------
try:
    from prometheus_client import Counter, Histogram  # type: ignore
except Exception:  # Library not installed or misconfigured
    Counter = None  # type: ignore
    Histogram = None  # type: ignore

# --- Optional OpenTelemetry instruments -----------------------------------
try:
    # OTel >= 1.20 uses `opentelemetry.metrics` with `get_meter`
    from opentelemetry import metrics as otel_metrics  # type: ignore
    _otel_meter = getattr(otel_metrics, "get_meter", lambda name: None)(__name__)
except Exception:
    _otel_meter = None  # type: ignore

_init_t0 = perf_counter()

# Prometheus
if Counter and Histogram:
    try:
        IMPORTS_TOTAL = Counter(
            "ingestion_module_imports_total",
            "Number of times the ingestion package is imported (process scope).",
        )
        INIT_DURATION = Histogram(
            "ingestion_init_duration_seconds",
            "Wall-clock seconds spent during ingestion package import/initialization.",
            buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
        )
    except Exception:
        IMPORTS_TOTAL = None  # type: ignore
        INIT_DURATION = None  # type: ignore
else:
    IMPORTS_TOTAL = None  # type: ignore
    INIT_DURATION = None  # type: ignore

# OpenTelemetry
try:
    _otel_imports_total = (
        _otel_meter.create_counter("ingestion.module.imports") if _otel_meter else None
    )
    _otel_init_duration = (
        _otel_meter.create_histogram("ingestion.init.duration") if _otel_meter else None
    )
except Exception:
    _otel_imports_total = None  # type: ignore
    _otel_init_duration = None  # type: ignore


def _observe_init_metrics() -> None:
    """Record import/init metrics in Prometheus and OTel (no-ops if unavailable)."""
    dt = perf_counter() - _init_t0
    # Prometheus
    if IMPORTS_TOTAL is not None:
        try:
            IMPORTS_TOTAL.inc()
        except Exception:
            pass
    if INIT_DURATION is not None:
        try:
            INIT_DURATION.observe(dt)
        except Exception:
            pass
    # OpenTelemetry
    if _otel_imports_total is not None:
        try:
            # OTel API uses .add(value, attributes=None)
            _otel_imports_total.add(1)
        except Exception:
            pass
    if _otel_init_duration is not None:
        try:
            # OTel API uses .record(value, attributes=None)
            _otel_init_duration.record(dt)
        except Exception:
            pass


# Observe immediately on import (critical path of package load)
_observe_init_metrics()

__all__ = [
    # We only export metric objects if they exist for optional external use.
    "IMPORTS_TOTAL",
    "INIT_DURATION",
]
