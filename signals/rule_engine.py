from __future__ import annotations
"""
rule_engine
-----------
Computes a simple composite rule-based score from OHLCV-derived features.

Observability:
- Prometheus counter: total calls to `rule_score`
- Prometheus histogram: latency of `rule_score` (seconds)
"""

import time
import pandas as pd

# Optional Prometheus metrics
try:
    from prometheus_client import Counter, Histogram  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    Counter = None  # type: ignore
    Histogram = None  # type: ignore

_RULE_SCORE_COUNT = Counter("rule_engine_rule_score_total",
                            "Total number of rule_score calls.") if Counter else None
_RULE_SCORE_SECONDS = Histogram("rule_engine_rule_score_seconds",
                                "Latency of rule_score in seconds.") if Histogram else None


def rule_score(df: pd.DataFrame) -> pd.Series:
    """A simple composite score based on ADX trend strength and price vs VWAP."""
    t0 = time.time()

    # Normalize adx: map [0..50+] to [0..1] capped
    adx_norm = (df["adx"].clip(0, 50) / 50.0)

    # +1 if above vwap, -1 if below
    above_vwap = (df["close"] > df["vwap"]).astype(float) * 2 - 1

    # relative volatility (ATR / price), capped at 5%
    atr_norm = (df["atr"] / (df["close"].replace(0, 1e-9))).clip(0, 0.05) / 0.05

    score = 0.6 * adx_norm + 0.2 * above_vwap - 0.2 * atr_norm
    out = score.clip(-1, 1)

    # Metrics (no-op if prometheus_client missing)
    if _RULE_SCORE_COUNT:
        try:
            _RULE_SCORE_COUNT.inc()
        except Exception:
            pass
    if _RULE_SCORE_SECONDS:
        try:
            _RULE_SCORE_SECONDS.observe(time.time() - t0)
        except Exception:
            pass

    return out
