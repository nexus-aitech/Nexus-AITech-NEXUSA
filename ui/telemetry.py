"""Lightweight telemetry for UI and services.

- JSONL appends (event/metric/session_replay) با نمونه‌برداری قابل‌تنظیم
- Flush همزمان/پس‌زمینه‌ای با محدودکننده‌ی تعداد و بازه‌ی زمانی
- Scrubbing سطحی برای کلیدهای PII متداول
- هوک لاگ و متریک‌های Prometheus
"""

from __future__ import annotations

import atexit
import json
import logging
import os
import threading
import time
import uuid
import hashlib
import random
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from prometheus_client import Counter, Histogram

__all__ = [
    "TelemetryConfig",
    "TelemetryClient",
    "setup_logging",
    "msg_rate",
    "dropped_msgs",
    "lag_ms",
    "feature_latency",
    "invalid_feature_rate",
]

# ---------------------------------- Utils ---------------------------------- #

def _hash_str(s: Optional[str]) -> str:
    """Return a short, stable SHA-256 hash for a possibly None string."""
    return hashlib.sha256((s or "").encode("utf-8")).hexdigest()[:16]


def _mask(s: Any, keep: int = 3) -> str:
    """Mask a value, keeping the last `keep` characters visible."""
    s = str(s or "")
    if keep <= 0:
        return "*" * len(s)
    if len(s) <= keep:
        return "*" * (len(s) - 1) + (s[-1:] or "")
    return ("*" * (len(s) - keep)) + s[-keep:]


# Common PII-ish keys that should be scrubbed in props/tags payloads
_PII_KEYS = {
    "email",
    "phone",
    "name",
    "fullname",
    "first_name",
    "last_name",
    "address",
    "text",
    "message",
}


def _scrub_props(props: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of `props` with obvious PII masked.

    Notes:
        - Only performs shallow scrubbing (top-level keys).
        - Strings are masked; non-strings are replaced with a fixed token.
    """
    clean: Dict[str, Any] = {}
    for k, v in (props or {}).items():
        kl = str(k).lower()
        if kl in _PII_KEYS:
            clean[k] = _mask(v) if isinstance(v, str) else "***"
        else:
            clean[k] = v
    return clean


# ------------------------------- Configuration ----------------------------- #

@dataclass
class TelemetryConfig:
    """Runtime configuration for telemetry I/O and sampling."""

    out_dir: str = "/mnt/data/NEXUSA/telemetry"
    app: str = "NEXUSA"
    sampling: float = 1.0  # 0..1 inclusive
    flush_every: int = 100  # flush after N enqueued events
    flush_interval_s: Optional[float] = 5.0  # background flush cadence (None disables)
    session_replay_limit: int = 500

    def __post_init__(self) -> None:
        """Clamp values to safe ranges and normalize types."""
        # Clamp values to safe ranges
        self.sampling = float(max(0.0, min(1.0, self.sampling)))
        self.flush_every = max(1, int(self.flush_every))
        if self.flush_interval_s is not None:
            self.flush_interval_s = max(0.25, float(self.flush_interval_s))
        self.session_replay_limit = max(0, int(self.session_replay_limit))


# ---------------------------------- Client --------------------------------- #

@dataclass
class TelemetryClient:
    """Producer of telemetry events/metrics with buffered JSONL persistence."""

    user_id: Optional[str] = None
    cfg: TelemetryConfig = field(default_factory=TelemetryConfig)
    session_id: str = field(default_factory=lambda: uuid.uuid4().hex)

    # internals
    _queue: List[Dict[str, Any]] = field(default_factory=list, init=False, repr=False)
    _lock: threading.RLock = field(default_factory=threading.RLock, init=False, repr=False)
    _bg_thread: Optional[threading.Thread] = field(default=None, init=False, repr=False)
    _stop_event: threading.Event = field(default_factory=threading.Event, init=False, repr=False)

    def __post_init__(self) -> None:
        """Prepare output directory, hash user_id, and start background flusher if enabled."""
        os.makedirs(self.cfg.out_dir, exist_ok=True)
        if self.user_id:
            self.user_id = _hash_str(self.user_id)
        # Background flusher (optional)
        if self.cfg.flush_interval_s:
            self._bg_thread = threading.Thread(target=self._bg_flush_loop, name="TelemetryFlush", daemon=True)
            self._bg_thread.start()
        # Ensure we always flush at process exit
        atexit.register(self.flush)

    # ---------------------------- Enqueue / Flush --------------------------- #

    def _sampled(self) -> bool:
        """Bernoulli sampling based on cfg.sampling."""
        if self.cfg.sampling >= 1.0:
            return True
        if self.cfg.sampling <= 0.0:
            return False
        return random.random() < self.cfg.sampling

    def _enq(self, ev: Dict[str, Any]) -> None:
        """Append an event to the local buffer and trigger flush if threshold reached."""
        if not self._sampled():
            return
        with self._lock:
            self._queue.append(ev)
            should_flush = len(self._queue) >= self.cfg.flush_every
        if should_flush:
            self.flush()

    def flush(self) -> None:
        """Persist all queued events to a JSONL file (append-only)."""
        with self._lock:
            if not self._queue:
                return
            # Copy & clear under lock quickly to minimize contention
            pending, self._queue = self._queue, []
        out_path = os.path.join(self.cfg.out_dir, "events.jsonl")
        # Perform I/O outside the lock
        with open(out_path, "a", encoding="utf-8") as f:
            for ev in pending:
                f.write(json.dumps(ev, ensure_ascii=False, separators=(",", ":")) + "\n")

    def _bg_flush_loop(self) -> None:
        """Background loop that flushes at configured intervals until stopped."""
        interval = self.cfg.flush_interval_s
        if interval is None:
            return  # safety guard to avoid assertion in production code
        while not self._stop_event.wait(interval):
            try:
                self.flush()
            except Exception:
                logging.getLogger(__name__).exception("Background flush failed")

    def close(self) -> None:
        """Stop background thread (if any) and flush remaining events."""
        if self._bg_thread and self._bg_thread.is_alive():
            self._stop_event.set()
            self._bg_thread.join(timeout=self.cfg.flush_interval_s or 1.0)
        self.flush()

    # ------------------------------ Recording ------------------------------ #

    def record_event(self, name: str, props: Optional[Dict[str, Any]] = None) -> None:
        """Record a named event with (lightly scrubbed) properties."""
        now = time.time()
        ev = {
            "type": "event",
            "app": self.cfg.app,
            "session_id": self.session_id,
            "user_id": self.user_id,
            "name": str(name),
            "props": _scrub_props(props or {}),
            "ts": now,
        }
        self._enq(ev)

    def record_metric(self, name: str, value: float, tags: Optional[Dict[str, Any]] = None) -> None:
        """Record a numeric metric with optional tags (scrubbed)."""
        now = time.time()
        ev = {
            "type": "metric",
            "app": self.cfg.app,
            "session_id": self.session_id,
            "user_id": self.user_id,
            "name": str(name),
            "value": float(value),
            "tags": _scrub_props(tags or {}),
            "ts": now,
        }
        self._enq(ev)

    # --------------------------- Session Replay ---------------------------- #

    @contextmanager
    def session_replay(self) -> Callable[[str, str, Optional[Dict[str, Any]]], None]:
        """Capture a privacy-safe sequence of UI interactions.

        Usage:
            with client.session_replay() as log_ui:
                log_ui("click", "#submit", {"email": "a@b.com"})
        """
        buf: List[Dict[str, Any]] = []
        start = time.time()

        def _log_ui(action: str, target: str, meta: Optional[Dict[str, Any]] = None) -> None:
            """Append a UI action (action, target, meta) to the in-memory replay buffer."""
            buf.append(
                {
                    "t": time.time(),
                    "a": str(action)[:32],
                    "target": str(target)[:128],
                    "meta": _scrub_props(meta or {}),
                }
            )

        try:
            yield _log_ui
        finally:
            end = time.time()
            out = {
                "type": "session_replay",
                "app": self.cfg.app,
                "session_id": self.session_id,
                "user_id": self.user_id,
                "duration": max(0.0, end - start),
                "events": buf[: self.cfg.session_replay_limit],
                "ts": end,
            }
            self._enq(out)

    # ----------------------------- Timing Decorator ------------------------ #

    def timeit(self, name: str, tags: Optional[Dict[str, Any]] = None) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        """Decorator to measure wall-time of a function and record it as a metric.

        Example:
            @client.timeit("feature.compute", {"feature": "ema_20"})
            def compute_ema(...):
                ...
        """

        def deco(fn: Callable[..., Any]) -> Callable[..., Any]:
            """Wrap `fn` to time execution and emit a metric named `name`."""
            def wrapper(*args: Any, **kwargs: Any) -> Any:
                """Invoke wrapped function and record duration (seconds) as a metric."""
                t0 = time.time()
                try:
                    return fn(*args, **kwargs)
                finally:
                    dt_s = time.time() - t0
                    # Store seconds; if you prefer ms, multiply by 1000.
                    self.record_metric(name, dt_s, tags=tags)

            # Preserve metadata
            wrapper.__name__ = getattr(fn, "__name__", "wrapped")
            wrapper.__doc__ = getattr(fn, "__doc__", None)
            wrapper.__qualname__ = getattr(fn, "__qualname__", wrapper.__name__)
            return wrapper

        return deco


# ------------------------------- Logging setup ----------------------------- #


def setup_logging(level: int = logging.INFO) -> None:
    """Setup root logger with a sane format to stdout.

    Note: calling basicConfig multiple times has no effect unless force=True (3.8+).
    We use force=True to ensure consistent format in multi-module apps.
    """
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler()],
        force=True,
    )


# ----------------------------- Prometheus metrics -------------------------- #

# NOTE: Best practice is to use _total for Counters and _seconds for time histograms.
# Here we keep original names for backward compatibility, but consider renaming.
msg_rate = Counter("nexusa_msg_rate", "Messages produced", ["topic"])

dropped_msgs = Counter("nexusa_dropped_msgs", "Dropped messages", ["reason"])

lag_ms = Histogram(
    "nexusa_lag_ms",
    "Ingestion to broker lag (ms)",
    buckets=(1, 5, 10, 20, 40, 80, 160, 320, 640, 1280),
)

feature_latency = Histogram("nexusa_feature_latency_ms", "Feature compute latency (ms)")

invalid_feature_rate = Counter("nexusa_invalid_feature", "Invalid feature rows")
