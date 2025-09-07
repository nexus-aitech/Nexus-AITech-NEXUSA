"""NEXUSA — time_utils.py

High-precision, deterministic, and exchange-friendly time utilities for
real-time ingestion, feature/indicator computation, signal generation, and
backtesting.

This module implements the architecture's needs around:
- Clock hygiene & latency measurement: `ts_event` vs `ingest_ts`, p95 budgets
- Stable timeframe (tf) semantics (e.g., "15m", "1h", "1d", "1w", "1mo")
- Candle alignment/iteration in UTC with exact integer-millisecond math
- Monotonic timing for scheduling and SLO-friendly timers
- ISO8601 parsing/formatting for auditability and storage

No third-party dependencies; uses only Python stdlib. Optional ZoneInfo if
available (Py>=3.9).
"""
from __future__ import annotations

import dataclasses
import datetime as _dt
import logging
import math
import re
import time
import typing as T

try:  # Python 3.9+
    from zoneinfo import ZoneInfo  # type: ignore
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

# basic logger for CLI and debugging (no-op if global configured elsewhere)
_log = logging.getLogger("nexusa.core.time_utils")
if not _log.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

__all__ = [
    # constants
    "MS", "SECOND_MS", "MINUTE_MS", "HOUR_MS", "DAY_MS", "WEEK_MS",
    # now / clocks
    "now_ms", "utcnow_ms", "monotonic_ms", "HybridClock", "sleep_until_ms",
    # ISO helpers
    "to_iso_utc", "from_iso_to_ms",
    # timeframes & candles
    "Timeframe", "parse_timeframe", "tf_to_timedelta", "tf_to_ms",
    "candle_open_ms", "candle_close_ms", "candle_bounds", "is_aligned",
    "next_candle_open_ms", "iter_candles",
    # latency / SLO
    "compute_lag_ms", "Stopwatch",
]

# ----------------------- constants -----------------------
MS: int = 1
SECOND_MS: int = 1_000
MINUTE_MS: int = 60_000
HOUR_MS: int = 3_600_000
DAY_MS: int = 86_400_000
WEEK_MS: int = 7 * DAY_MS

# ----------------------- clock helpers -----------------------

def now_ms() -> int:
    """Return wall-clock milliseconds since Unix epoch (UTC)."""
    return int(_dt.datetime.now(tz=_dt.timezone.utc).timestamp() * 1_000)


def utcnow_ms() -> int:
    """Alias for :func:`now_ms` for clarity in call sites."""
    return now_ms()


def monotonic_ms() -> int:
    """Return monotonic milliseconds (no epoch meaning, unaffected by wall-clock jumps)."""
    return time.monotonic_ns() // 1_000_000


@dataclasses.dataclass(frozen=True)
class HybridClock:
    """A clock that uses wall time anchored to monotonic progress.

    On init, we capture `time.time_ns()` and `time.monotonic_ns()`. Subsequent
    reads compute `anchor_wall_ns + (monotonic_now - anchor_mono_ns)`.
    This avoids large jumps if the system wall clock changes during runtime,
    while still returning epoch-based timestamps.
    """
    anchor_wall_ns: int = dataclasses.field(default_factory=time.time_ns)
    anchor_mono_ns: int = dataclasses.field(default_factory=time.monotonic_ns)

    def now_ms(self) -> int:
        """Return current epoch milliseconds derived from the hybrid clock."""
        delta_ns = time.monotonic_ns() - self.anchor_mono_ns
        return (self.anchor_wall_ns + delta_ns) // 1_000_000


def sleep_until_ms(deadline_ms: int) -> None:
    """Sleep until the given *epoch* millisecond deadline using a monotonic base.

    If the computed remaining time is <= 0, returns immediately. Uses small
    chunks near wake-up to reduce oversleep drift.
    """
    hc = HybridClock()
    remaining_ms = deadline_ms - hc.now_ms()
    while remaining_ms > 0:
        if remaining_ms > 50:
            time.sleep(min(remaining_ms / 1000.0, 0.050))
        else:
            time.sleep(remaining_ms / 1000.0)
        remaining_ms = deadline_ms - hc.now_ms()


# ----------------------- ISO8601 helpers -----------------------
_ISO_Z_RE = re.compile(r"Z$")

def to_iso_utc(ms: int, sep: str = "T") -> str:
    """Convert epoch milliseconds to ISO8601 UTC (e.g., '2025-08-23T12:34:56.789Z')."""
    dt = _dt.datetime.fromtimestamp(ms / 1000.0, tz=_dt.timezone.utc)
    # Always include milliseconds
    return dt.strftime(f"%Y-%m-%d{sep}%H:%M:%S.%f")[:-3] + "Z"


def from_iso_to_ms(s: str) -> int:
    """Parse ISO8601 / RFC3339 datetimes to epoch ms.

    Supports 'Z' suffix or explicit offsets. If no timezone info, assume UTC.
    """
    s2 = s.strip()
    if _ISO_Z_RE.search(s2):
        # Python's fromisoformat doesn't accept 'Z'
        s2 = _ISO_Z_RE.sub("+00:00", s2)
    try:
        dt = _dt.datetime.fromisoformat(s2)
    except Exception as e:
        raise ValueError(f"Invalid ISO8601 datetime: {s!r}") from e
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_dt.timezone.utc)
    return int(dt.timestamp() * 1000)


# ----------------------- timeframe semantics -----------------------

_TF_RE = re.compile(r"^(?P<n>\d+)\s*(?P<u>s|m|h|d|w|mo)$", re.IGNORECASE)

@dataclasses.dataclass(frozen=True)
class Timeframe:
    """Represents a timeframe like '15m' or '1h'.

    Units:
      - s: seconds
      - m: minutes
      - h: hours
      - d: days (24h, UTC-boundary aligned)
      - w: weeks (ISO week, Monday 00:00 UTC)
      - mo: calendar months (aligned to the 1st day 00:00 UTC)
    """
    n: int
    unit: str  # 's'|'m'|'h'|'d'|'w'|'mo'

    @property
    def label(self) -> str:
        """Return the compact label form, e.g. '15m' or '1h'."""
        return f"{self.n}{self.unit}"

    def __str__(self) -> str:  # pragma: no cover
        """String representation identical to :pyattr:`label`."""
        return self.label


def parse_timeframe(tf: str | Timeframe) -> Timeframe:
    """Parse a timeframe string or passthrough an existing :class:`Timeframe`.

    Raises:
        ValueError: If the timeframe is invalid or non-positive.
    """
    if isinstance(tf, Timeframe):
        return tf
    m = _TF_RE.match(tf.strip())
    if not m:
        raise ValueError(f"Invalid timeframe: {tf!r}")
    n = int(m.group("n"))
    unit = m.group("u").lower()
    if n <= 0:
        raise ValueError("Timeframe multiplier must be positive")
    return Timeframe(n=n, unit=unit)


def tf_to_ms(tf: str | Timeframe) -> int | None:
    """Return timeframe length in milliseconds if fixed-length, else None for 'mo'."""
    t = parse_timeframe(tf)
    if t.unit == "s":
        return t.n * SECOND_MS
    if t.unit == "m":
        return t.n * MINUTE_MS
    if t.unit == "h":
        return t.n * HOUR_MS
    if t.unit == "d":
        return t.n * DAY_MS
    if t.unit == "w":
        return t.n * WEEK_MS
    if t.unit == "mo":
        return None
    raise RuntimeError("unreachable unit in tf_to_ms")


def tf_to_timedelta(tf: str | Timeframe) -> _dt.timedelta | None:
    """Convert a timeframe to :class:`datetime.timedelta` if fixed-length, else None for 'mo'."""
    t = parse_timeframe(tf)
    if t.unit == "s":
        return _dt.timedelta(seconds=t.n)
    if t.unit == "m":
        return _dt.timedelta(minutes=t.n)
    if t.unit == "h":
        return _dt.timedelta(hours=t.n)
    if t.unit == "d":
        return _dt.timedelta(days=t.n)
    if t.unit == "w":
        return _dt.timedelta(weeks=t.n)
    if t.unit == "mo":
        return None
    raise RuntimeError("unreachable unit in tf_to_timedelta")


# ----------------------- calendar helpers -----------------------

def _dt_from_ms(ms: int) -> _dt.datetime:
    """Convert epoch milliseconds to an aware UTC :class:`datetime.datetime`."""
    return _dt.datetime.fromtimestamp(ms / 1000.0, tz=_dt.timezone.utc)


def _to_ms(dt: _dt.datetime) -> int:
    """Convert an aware/naive :class:`datetime.datetime` to epoch milliseconds (UTC)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_dt.timezone.utc)
    else:
        dt = dt.astimezone(_dt.timezone.utc)
    return int(dt.timestamp() * 1000)


def _floor_months(dt: _dt.datetime, n: int) -> _dt.datetime:
    """Floor `dt` to the start of its n-month bucket anchored at 1970-01-01 UTC."""
    y, m = dt.year, dt.month
    months_since_epoch = (y - 1970) * 12 + (m - 1)
    bucket = months_since_epoch // n * n
    year = 1970 + bucket // 12
    month = (bucket % 12) + 1
    return _dt.datetime(year, month, 1, tzinfo=_dt.timezone.utc)


def _add_months(dt: _dt.datetime, n: int) -> _dt.datetime:
    """Return a new datetime equal to `dt` shifted by `n` calendar months (day clamped)."""
    y, m = dt.year, dt.month
    total = (y * 12 + (m - 1)) + n
    year = total // 12
    month = (total % 12) + 1
    # clamp day to last day of target month
    day = min(dt.day, _month_days(year, month))
    return dt.replace(year=year, month=month, day=day)


def _month_days(year: int, month: int) -> int:
    """Return number of days in `month` of `year`."""
    if month == 12:
        next_month = _dt.date(year + 1, 1, 1)
    else:
        next_month = _dt.date(year, month + 1, 1)
    this_month = _dt.date(year, month, 1)
    return (next_month - this_month).days


# ----------------------- candle alignment -----------------------

def candle_open_ms(ts_ms: int, tf: str | Timeframe) -> int:
    """Return the candle open (floor) in ms for timestamp `ts_ms` at timeframe `tf`.

    All alignment is in UTC. For 'w', we align to ISO Monday 00:00:00 UTC.
    For 'mo', we align to the 1st day of the bucketed month.
    """
    t = parse_timeframe(tf)
    if t.unit == "mo":
        dt = _dt_from_ms(ts_ms)
        floored = _floor_months(dt, t.n)
        return _to_ms(floored)

    if t.unit == "w":
        # ISO Monday is 1; convert to 0-based days since Monday
        dt = _dt_from_ms(ts_ms)
        weekday = dt.weekday()  # Monday=0..Sunday=6
        week_start = _dt.datetime(dt.year, dt.month, dt.day, tzinfo=_dt.timezone.utc) - _dt.timedelta(days=weekday)
        # Align weeks in groups of n
        since_epoch_days = (week_start - _dt.datetime(1970, 1, 1, tzinfo=_dt.timezone.utc)).days
        weeks_since_epoch = since_epoch_days // 7
        bucket = (weeks_since_epoch // t.n) * t.n
        aligned = _dt.datetime(1970, 1, 1, tzinfo=_dt.timezone.utc) + _dt.timedelta(weeks=bucket)
        return _to_ms(aligned)

    span_ms = tf_to_ms(t)
    if span_ms is None:
        raise ValueError("Timeframe 'mo' has no fixed millisecond span")
    return (ts_ms // span_ms) * span_ms


def candle_close_ms(ts_ms: int, tf: str | Timeframe) -> int:
    """Return the exclusive candle close time in ms for timestamp `ts_ms`.

    The close equals the next candle's open. For 'mo', it is the open of the
    next n-month bucket.
    """
    t = parse_timeframe(tf)
    if t.unit == "mo":
        open_ms = candle_open_ms(ts_ms, t)
        dt = _dt_from_ms(open_ms)
        close_dt = _add_months(dt, t.n)
        return _to_ms(close_dt)

    if t.unit == "w":
        open_ms = candle_open_ms(ts_ms, t)
        return open_ms + t.n * WEEK_MS

    span_ms = tf_to_ms(t)
    if span_ms is None:
        raise ValueError("Timeframe 'mo' has no fixed millisecond span")
    return candle_open_ms(ts_ms, t) + span_ms


def candle_bounds(ts_ms: int, tf: str | Timeframe) -> tuple[int, int]:
    """Return (open_ms, close_ms) for the candle containing `ts_ms`."""
    o = candle_open_ms(ts_ms, tf)
    c = candle_close_ms(ts_ms, tf)
    return o, c


def is_aligned(ts_ms: int, tf: str | Timeframe) -> bool:
    """Return True if `ts_ms` is exactly on a candle boundary for `tf`."""
    return candle_open_ms(ts_ms, tf) == ts_ms


def next_candle_open_ms(ts_ms: int, tf: str | Timeframe) -> int:
    """Return the open timestamp (ms) of the next candle after `ts_ms`."""
    return candle_close_ms(ts_ms, tf)


def iter_candles(start_ms: int, end_ms: int, tf: str | Timeframe, *, include_right: bool = False) -> T.Iterator[tuple[int, int]]:
    """Iterate candle (open_ms, close_ms) pairs covering [start_ms, end_ms].

    The first candle starts at floor(start_ms); iteration stops before `end_ms`
    unless `include_right` is True and end_ms is exactly aligned with a candle
    boundary.
    """
    if end_ms < start_ms:
        raise ValueError("end_ms must be >= start_ms")
    t = parse_timeframe(tf)
    o = candle_open_ms(start_ms, t)
    while True:
        c = candle_close_ms(o, t)
        if c > end_ms or (c == end_ms and not include_right):
            break
        yield (o, c)
        o = c


# ----------------------- latency & SLO -----------------------

def compute_lag_ms(ts_event_ms: int, ingest_ts_ms: int | None = None, *, clamp_negative: bool = True) -> int:
    """Compute end-to-end lag between event and ingestion timestamps.

    If `ingest_ts_ms` is None, uses current UTC now. If result is negative and
    `clamp_negative` is True, returns 0 to avoid confusing metrics when clocks
    are slightly off.
    """
    if ingest_ts_ms is None:
        ingest_ts_ms = now_ms()
    lag = ingest_ts_ms - ts_event_ms
    if clamp_negative and lag < 0:
        return 0
    return lag


class Stopwatch:
    """Simple SLO-friendly stopwatch with monotonic base.

    Usage:
        sw = Stopwatch(budget_ms=300)
        # ... do work ...
        elapsed = sw.elapsed_ms
        remaining = sw.remaining_ms
        if sw.exceeded:
            ...
    """
    __slots__ = ("_start_ns", "budget_ms")

    def __init__(self, budget_ms: int | None = None) -> None:
        """Create a stopwatch; optionally set a budget in milliseconds."""
        self._start_ns = time.monotonic_ns()
        self.budget_ms = budget_ms

    @property
    def elapsed_ms(self) -> int:
        """Milliseconds elapsed since creation."""
        return (time.monotonic_ns() - self._start_ns) // 1_000_000

    @property
    def remaining_ms(self) -> int | None:
        """Remaining milliseconds within budget, or None if no budget set."""
        if self.budget_ms is None:
            return None
        return max(0, self.budget_ms - self.elapsed_ms)

    @property
    def exceeded(self) -> bool:
        """True if the elapsed time has exceeded the budget."""
        return self.budget_ms is not None and self.elapsed_ms > self.budget_ms


# ----------------------- CLI (optional) -----------------------

def _fmt_bounds(o: int, c: int) -> str:
    """Format candle bounds for CLI display."""
    return f"open={to_iso_utc(o)} ({o})\nclose={to_iso_utc(c)} ({c})"


def _cli(argv: list[str]) -> int:  # pragma: no cover
    """Simple CLI for alignment, iteration, and ISO conversions."""
    import argparse
    ap = argparse.ArgumentParser(prog="time_utils", description="NEXUSA time utilities")
    sub = ap.add_subparsers(dest="cmd", required=True)

    ap_align = sub.add_parser("align", help="Align an epoch-ms to a timeframe")
    ap_align.add_argument("ts_ms", type=int)
    ap_align.add_argument("tf", type=str)

    ap_iter = sub.add_parser("iter", help="Iterate candles in a range")
    ap_iter.add_argument("start_ms", type=int)
    ap_iter.add_argument("end_ms", type=int)
    ap_iter.add_argument("tf", type=str)
    ap_iter.add_argument("--include-right", action="store_true")

    ap_iso = sub.add_parser("iso", help="ISO ↔ ms conversions")
    ap_iso.add_argument("value", type=str)

    ns = ap.parse_args(argv)

    if ns.cmd == "align":
        o = candle_open_ms(ns.ts_ms, ns.tf)
        c = candle_close_ms(ns.ts_ms, ns.tf)
        _log.info("%s", _fmt_bounds(o, c))
        return 0

    if ns.cmd == "iter":
        for o, c in iter_candles(ns.start_ms, ns.end_ms, ns.tf, include_right=ns.include_right):
            _log.info("%s", _fmt_bounds(o, c))
        return 0

    if ns.cmd == "iso":
        v = ns.value
        if v.isdigit():
            ms = int(v)
            _log.info("%s", to_iso_utc(ms))
        else:
            _log.info("%d", from_iso_to_ms(v))
        return 0

    return 1


if __name__ == "__main__":  # pragma: no cover
    import sys as _sys
    raise SystemExit(_cli(_sys.argv[1:]))
