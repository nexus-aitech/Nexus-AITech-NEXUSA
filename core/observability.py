"""
Observability helpers for lightweight latency measurements in NEXUSA.

This module exposes:
- `Timer`: a context manager to measure elapsed time in milliseconds.
- `observe_ingest_to_broker`: records ingest→broker lag into Prometheus histogram.
- `observe_feature_latency`: records feature computation latency.
"""

from __future__ import annotations

import logging
import time
from types import TracebackType
from typing import Optional, Type

from ui.telemetry import feature_latency, lag_ms

log = logging.getLogger("obs")


class Timer:
    """
    Simple context manager to measure elapsed wall-clock time in milliseconds.

    Usage:
        with Timer() as t:
            ...
        log.debug("elapsed ms = %s", t.dt_ms)
    """

    def __enter__(self) -> "Timer":
        """Start timing and return the timer instance."""
        self.t0 = time.perf_counter()
        return self

    def __exit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc: Optional[BaseException],
        tb: Optional[TracebackType],
    ) -> None:
        """Stop timing and store the elapsed time in milliseconds."""
        self.dt_ms = (time.perf_counter() - self.t0) * 1000


def observe_ingest_to_broker(start_ts: float) -> None:
    """
    Observe and log the latency from ingestion start to broker publish.

    Args:
        start_ts: A start timestamp captured via `time.perf_counter()`.

    Side effects:
        - Records the elapsed milliseconds into the `lag_ms` metric.
        - Emits a debug log line with the measured value.
    """
    dt_ms = (time.perf_counter() - start_ts) * 1000
    lag_ms.observe(dt_ms)
    log.debug("ingest→broker lag_ms=%.2f", dt_ms)


def observe_feature_latency(ms: float) -> None:
    """
    Observe feature computation latency in milliseconds.

    Args:
        ms: The latency to record (milliseconds).
    """
    feature_latency.observe(ms)
