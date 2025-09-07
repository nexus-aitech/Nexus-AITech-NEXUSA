from __future__ import annotations
"""
risk_controller
---------------
Centralized risk checks for exposure-per-asset, intraday max drawdown, and kill-switch.

Observability:
- Prometheus counters for evaluate_order decisions (by reason).
- Prometheus histogram for end-to-end latency of evaluate_order.
"""

from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple
import pandas as pd
import time

# Optional Prometheus metrics
try:
    from prometheus_client import Counter, Histogram  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    Counter = None  # type: ignore
    Histogram = None  # type: ignore

_EVAL_COUNT = (
    Counter(
        "risk_controller_evaluate_order_total",
        "Total evaluate_order decisions, labeled by reason.",
        ["reason"],
    )
    if Counter
    else None
)
_EVAL_SECONDS = (
    Histogram(
        "risk_controller_evaluate_order_seconds",
        "Latency of evaluate_order in seconds.",
    )
    if Histogram
    else None
)


@dataclass
class RiskControllerConfig:
    """تنظیمات قواعد ریسک.

    Attributes:
        max_exposure_per_asset: بیشینه نسبت نوتیونال هر دارایی به کل اکوییتی (مثلاً 0.05 یعنی 5٪).
        daily_max_drawdown: بیشینه افت سرمایه روزانه مجاز (نسبتی؛ مثلاً 0.05).
        enable_kill_switch: در صورت True، kill-switch اعمال می‌شود.
        base_currency: ارز مبنا برای محاسبات نوتیونال.
    """
    max_exposure_per_asset: float = 0.05   # ≤ 5% of equity
    daily_max_drawdown: float = 0.05       # e.g., 5% intraday MaxDD
    enable_kill_switch: bool = False
    base_currency: str = "USDT"


@dataclass
class AccountState:
    """وضعیت حساب برای تصمیم‌گیری‌های ریسکی.

    Attributes:
        equity: اکوییتی فعلی حساب.
        exposure_by_symbol: نگاشت نماد به نوتیونال اکسپوژر (قدر مطلق، بر حسب ارز مبنا).
        session_date: تاریخ سشن روزانه (UTC-normalized).
        peak_equity_today: بیشترین اکوییتی ثبت‌شده امروز.
        drawdown_today: بیشترین افتِ نسبت به قله امروز (عدد نسبتی 0..1).
        kill_switch: وضعیت کلید قطع معاملات.
    """
    equity: float
    exposure_by_symbol: Dict[str, float] = field(default_factory=dict)
    session_date: Optional[pd.Timestamp] = None
    peak_equity_today: Optional[float] = None
    drawdown_today: float = 0.0
    kill_switch: bool = False


class RiskViolation(Exception):
    """Raised when an order violates a risk rule."""


class RiskController:
    """
    Enforces risk rules:
      - exposure_per_asset ≤ max_exposure_per_asset
      - daily max_drawdown
      - kill_switch
    """

    def __init__(self, config: RiskControllerConfig) -> None:
        """سازنده: تنظیمات را ذخیره و وضعیت اولیه حساب را می‌سازد."""
        self.cfg = config
        self.state = AccountState(equity=0.0)

    def reset_day_if_needed(self, now_ts: pd.Timestamp) -> None:
        """در صورت تغییر روز (UTC) شاخص‌های روزانه را بازنشانی می‌کند."""
        d = pd.to_datetime(now_ts, utc=True).normalize()
        if self.state.session_date is None or d != self.state.session_date:
            self.state.session_date = d
            self.state.peak_equity_today = None
            self.state.drawdown_today = 0.0

    def update_equity(self, equity: float, now_ts: pd.Timestamp) -> None:
        """به‌روزرسانی اکوییتی و محاسبهٔ بیشینه قله و افت روزانه."""
        self.reset_day_if_needed(pd.to_datetime(now_ts, utc=True))
        self.state.equity = float(equity)
        if self.state.peak_equity_today is None:
            self.state.peak_equity_today = equity
        else:
            self.state.peak_equity_today = max(self.state.peak_equity_today, equity)
        peak = self.state.peak_equity_today or equity
        if peak > 0:
            self.state.drawdown_today = max(self.state.drawdown_today, (peak - equity) / peak)

    def set_kill_switch(self, enabled: bool) -> None:
        """فعال/غیرفعال کردن kill-switch."""
        self.state.kill_switch = bool(enabled)

    def update_exposure(self, symbol: str, notional: float) -> None:
        """تنظیم نوتیونال اکسپوژر فعلی برای نماد داده‌شده (قدر مطلق، ≥ 0)."""
        self.state.exposure_by_symbol[symbol] = float(max(0.0, notional))

    def get_allowed_notional(self, symbol: str) -> float:
        """
        Returns the maximum additional notional allowed for a new order on `symbol`.
        """
        equity = max(0.0, self.state.equity)
        max_per_asset = self.cfg.max_exposure_per_asset * equity
        current = self.state.exposure_by_symbol.get(symbol, 0.0)
        return max(0.0, max_per_asset - current)

    def evaluate_order(self, symbol: str, desired_notional: float, now_ts: pd.Timestamp) -> Tuple[bool, str, float]:
        """
        Evaluate risk constraints for a proposed order.

        Returns:
            (approved, reason, allowed_notional)
        """
        t0 = time.time()
        self.reset_day_if_needed(pd.to_datetime(now_ts, utc=True))

        # Kill switch
        if self.cfg.enable_kill_switch and self.state.kill_switch:
            reason = "KILL_SWITCH_ACTIVE"
            if _EVAL_COUNT:
                try:
                    _EVAL_COUNT.labels(reason=reason).inc()
                except Exception:
                    pass
            if _EVAL_SECONDS:
                try:
                    _EVAL_SECONDS.observe(time.time() - t0)
                except Exception:
                    pass
            return (False, reason, 0.0)

        # Daily MaxDD
        if self.state.drawdown_today >= self.cfg.daily_max_drawdown:
            reason = "DAILY_MAX_DRAWDOWN_EXCEEDED"
            if _EVAL_COUNT:
                try:
                    _EVAL_COUNT.labels(reason=reason).inc()
                except Exception:
                    pass
            if _EVAL_SECONDS:
                try:
                    _EVAL_SECONDS.observe(time.time() - t0)
                except Exception:
                    pass
            return (False, reason, 0.0)

        # Exposure per asset
        allowed = self.get_allowed_notional(symbol)
        if desired_notional <= allowed + 1e-9:
            reason = "APPROVED"
            if _EVAL_COUNT:
                try:
                    _EVAL_COUNT.labels(reason=reason).inc()
                except Exception:
                    pass
            if _EVAL_SECONDS:
                try:
                    _EVAL_SECONDS.observe(time.time() - t0)
                except Exception:
                    pass
            return (True, reason, desired_notional)
        if allowed > 0.0:
            reason = "PARTIALLY_APPROVED_EXPOSURE_CAPPED"
            if _EVAL_COUNT:
                try:
                    _EVAL_COUNT.labels(reason=reason).inc()
                except Exception:
                    pass
            if _EVAL_SECONDS:
                try:
                    _EVAL_SECONDS.observe(time.time() - t0)
                except Exception:
                    pass
            return (True, reason, allowed)

        reason = "EXPOSURE_LIMIT_REACHED"
        if _EVAL_COUNT:
            try:
                _EVAL_COUNT.labels(reason=reason).inc()
            except Exception:
                pass
        if _EVAL_SECONDS:
            try:
                _EVAL_SECONDS.observe(time.time() - t0)
            except Exception:
                pass
        return (False, reason, 0.0)

    def status(self) -> Dict[str, float]:
        """خلاصه وضعیت فعلی ریسک را برمی‌گرداند."""
        return {
            "equity": self.state.equity,
            "daily_drawdown": self.state.drawdown_today,
            "max_exposure_per_asset": self.cfg.max_exposure_per_asset,
        }
