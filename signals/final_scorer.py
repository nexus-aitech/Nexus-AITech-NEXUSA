from __future__ import annotations

"""
final_scorer
------------
Combines rule-based scores with ML TP probabilities to produce a unified signal score,
then derives direction and metadata for downstream execution/analytics.
Includes lightweight Prometheus metrics on the critical path.
"""

import numpy as np
import uuid
import time
from typing import Literal, TypedDict, Any, Dict
try:
    # Optional: if prometheus_client is unavailable, metrics become no-ops
    from prometheus_client import Counter, Histogram  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    Counter = None  # type: ignore
    Histogram = None  # type: ignore

# -------- Observability (Prometheus) --------
_SIGNAL_GEN_COUNT = (
    Counter("final_scorer_signals_generated_total",
            "Total number of signals generated, labeled by direction.",
            ["direction"])
    if Counter else None
)
_SIGNAL_GEN_SECONDS = (
    Histogram("final_scorer_generate_signal_seconds",
              "Latency of generate_signal in seconds.")
    if Histogram else None
)


class SignalResult(TypedDict):
    """TypedDict خروجی سیگنال نهایی.

    Fields:
        signal_id: شناسه یکتا (UUID4).
        symbol: نماد معاملاتی (e.g., BTCUSDT).
        tf: تایم‌فریم (e.g., 1m, 1h, 1d).
        score: امتیاز نهایی در بازه [-1, 1].
        direction: جهت سیگنال: "long" | "short" | "neutral".
        entry: لیست قیمت‌های ورود (می‌تواند چندسطحی باشد).
        stop_loss: حد ضرر.
        take_profit: لیست حد سودها.
        confidence: اعتماد به سیگنال [0, 1] بر اساس |score|.
        model_id: شناسه مدل/ترکیب مدل‌ها.
        created_at: زمان ایجاد (ms since epoch).
        rationale_id: شناسه توضیحات/منطق تولید سیگنال.
    """
    signal_id: str
    symbol: str
    tf: str
    score: float
    direction: Literal["long", "short", "neutral"]
    entry: list[float]
    stop_loss: float
    take_profit: list[float]
    confidence: float
    model_id: str
    created_at: int
    rationale_id: str


def final_score(rule_score: np.ndarray, ml_prob_tp: np.ndarray) -> np.ndarray:
    """
    Combines rule-based score and ML-based TP probability into a unified score in range [-1, +1]
    """
    rule_score = np.clip(rule_score, -1, 1)
    ml_scaled = (np.clip(ml_prob_tp, 0, 1) * 2) - 1  # convert to [-1, 1]
    return 0.6 * rule_score + 0.4 * ml_scaled


def direction_from_score(score: float, threshold: float = 0.35) -> Literal["long", "short", "neutral"]:
    """
    Maps a continuous score in [-1, 1] to a trading direction.

    Args:
        score: مقدار امتیاز نهایی.
        threshold: آستانه تصمیم؛ اگر |score| < threshold => neutral.
    Returns:
        "long" | "short" | "neutral"
    """
    if score >= threshold:
        return "long"
    elif score <= -threshold:
        return "short"
    return "neutral"


def score_to_confidence(score: float) -> float:
    """
    Maps absolute score to a confidence value in [0, 1]
    """
    return float(np.clip(abs(score), 0, 1))


def generate_signal(
    symbol: str,
    tf: str,
    rule_score: float,
    ml_prob_tp: float,
    model_id: str,
    rationale_id: str,
    entry: list[float],
    stop_loss: float,
    take_profit: list[float],
) -> SignalResult:
    """
    Builds a `SignalResult` using rule score and ML TP probability.

    Notes:
        - ساختار خروجی تغییری نکرده و فقط مستندسازی/متریک اضافه شده.
        - متریک‌های Prometheus (در صورت نصب) latency و تعداد سیگنال‌ها را ثبت می‌کنند.
    """
    _t0 = time.time()
    score = float(final_score(np.array([rule_score]), np.array([ml_prob_tp]))[0])
    direction = direction_from_score(score)
    confidence = score_to_confidence(score)
    signal_id = str(uuid.uuid4())
    created_at = int(time.time() * 1000)

    result = SignalResult(
        signal_id=signal_id,
        symbol=symbol,
        tf=tf,
        score=score,
        direction=direction,
        entry=entry,
        stop_loss=stop_loss,
        take_profit=take_profit,
        confidence=confidence,
        model_id=model_id,
        created_at=created_at,
        rationale_id=rationale_id,
    )
    # observe metrics (no-op if Prometheus unavailable)
    if _SIGNAL_GEN_COUNT:
        try:
            _SIGNAL_GEN_COUNT.labels(direction=direction).inc()
        except Exception:
            pass
    if _SIGNAL_GEN_SECONDS:
        try:
            _SIGNAL_GEN_SECONDS.observe(time.time() - _t0)
        except Exception:
            pass
    return result
