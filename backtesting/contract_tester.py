"""
backtesting/contract_tester.py

Contract tests ensuring alignment between backtest and paper/live behavior
within configurable thresholds.

Key checks:
- Equity curve alignment (CAGR, MaxDD, Calmar, Sharpe deltas)
- Trade distribution alignment (hit-rate, expected R:R, avg win/loss)
- Slippage/fee sanity vs configured budgets
- Time alignment & data integrity (no lookahead bias via timestamp ordering)

Usage:
    tester = ContractTester(Thresholds())
    report = tester.evaluate(
        bt_equity=bt_eq, live_equity=live_eq,
        bt_trades=bt_trades, live_trades=live_trades,
        periods_per_year=365,
        rf=0.0,
        max_per_trade_slippage_bps=5.0,
    )
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any, Tuple

import numpy as np
import pandas as pd

# ✅ لایه‌بندی: وابستگی به storage حذف شد.
# به‌جای import از storage.schema_registry، یک رجیستری سبک داخلی داریم.
_SCHEMA_REGISTRY: dict[tuple[str, str], dict] = {}


def register(name: str, version: str, schema: dict) -> None:
    """Register a JSON schema under (name, version)."""
    _SCHEMA_REGISTRY[(name, version)] = schema


def _get_schema(name: str, version: str) -> dict:
    """Retrieve a registered JSON schema by (name, version)."""
    key = (name, version)
    if key not in _SCHEMA_REGISTRY:
        raise KeyError(f"Schema not registered: {name} v{version}")
    return _SCHEMA_REGISTRY[key]


# Local JSON Schema validation (اختیاری)
try:
    from jsonschema import Draft7Validator, ValidationError, SchemaError  # type: ignore
except Exception:  # pragma: no cover
    Draft7Validator = None  # type: ignore
    ValidationError = Exception  # type: ignore
    SchemaError = Exception  # type: ignore

from core.schema.feature_schema import FEATURE_SCHEMA, FEATURE_SCHEMA_NAME, FEATURE_SCHEMA_V
from core.schema.signal_schema import SIGNAL_SCHEMA, SIGNAL_SCHEMA_NAME, SIGNAL_SCHEMA_V
from backtesting.metrics import (
    summarize,
    _to_series,   # internal helper for robustness
    _returns_from_equity,
)

log = logging.getLogger("contract_tester")


def _ensure_schema(name: str, version: str, payload: Dict[str, Any]) -> None:
    """Validate a payload against a registered schema if jsonschema is available."""
    try:
        schema = _get_schema(name, version)
    except Exception as e:  # pragma: no cover
        raise RuntimeError(f"Unable to retrieve schema '{name}' v{version}: {e}") from e

    if Draft7Validator is None:  # jsonschema not installed → skip strict validation
        return

    try:
        validator = Draft7Validator(schema)
        errs = sorted(validator.iter_errors(payload), key=lambda er: er.path)
        if errs:
            err = errs[0]
            path = ".".join(str(p) for p in err.path)
            raise ValueError(f"[{name} v{version}] schema failed at {path}: {err.message}")
    except SchemaError as se:  # pragma: no cover
        raise RuntimeError(f"Invalid schema for '{name}' v{version}: {se}") from se


def _mono(index: pd.Index) -> bool:
    """Return True if a pandas Index is monotonic increasing or not datetime-like.

    For non-DatetimeIndex, we don't enforce monotonicity here.
    """
    if not isinstance(index, pd.DatetimeIndex):
        return True
    return index.is_monotonic_increasing


def _delta(a: float, b: float) -> float:
    """Absolute difference between two floats as a plain float."""
    return float(abs(float(a) - float(b)))


def _exp_rr_from_trades(df: pd.DataFrame) -> float:
    """Compute expected R:R ≈ avg(win) / avg(|loss|) from a trades DataFrame with 'pnl'."""
    wins = df.loc[df["pnl"] > 0, "pnl"]
    losses = -df.loc[df["pnl"] < 0, "pnl"]
    if len(losses) == 0:
        return float("inf") if len(wins) > 0 else 0.0
    if len(wins) == 0:
        return 0.0
    return float(wins.mean() / losses.mean())


# ------------------------------- Data Models ------------------------------- #

@dataclass(frozen=True)
class Thresholds:
    """Configurable absolute deltas and caps for contract checks."""
    # Metric deltas (absolute) — set small, tighten in CI over time
    max_cagr_delta: float = 0.05        # 5 percentage points
    max_mdd_delta: float = 0.05         # 5 percentage points
    max_calmar_delta: float = 0.25
    max_sharpe_delta: float = 0.25
    max_hitrate_delta: float = 0.05     # 5 percentage points
    max_exrr_delta: float = 0.25        # absolute ratio delta

    # Curve tracking — mean absolute tracking error on returns
    max_curve_mae: float = 0.0015       # per-period MAE on returns

    # Operational sanity checks
    max_trade_count_delta: int = 10
    max_per_trade_slippage_bps: float = 10.0  # configurable per evaluation


@dataclass(frozen=True)
class CheckResult:
    """Single check result with pass/fail, measured value, threshold, and optional details."""
    passed: bool
    value: float | int | dict | None
    threshold: float | int | None
    details: Optional[dict] = None


@dataclass(frozen=True)
class ContractReport:
    """Aggregate report of all contract checks and the config used."""
    passed: bool
    checks: Dict[str, CheckResult]
    config: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the report to a plain dict (JSON-friendly)."""
        return {
            "passed": self.passed,
            "checks": {k: asdict(v) for k, v in self.checks.items()},
            "config": self.config,
        }


# --------------------------------- Tester --------------------------------- #

class ContractTester:
    """Runs contract checks between backtest and live/paper outputs under thresholds."""

    def __init__(self, thresholds: Optional[Thresholds] = None) -> None:
        """Initialize the tester with optional custom thresholds."""
        self.thresholds = thresholds or Thresholds()

    # --------- public API ---------

    def evaluate(
        self,
        bt_equity: pd.Series | np.ndarray | list[float] | None = None,
        live_equity: pd.Series | np.ndarray | list[float] | None = None,
        bt_trades: Optional[pd.DataFrame] = None,
        live_trades: Optional[pd.DataFrame] = None,
        periods_per_year: Optional[int] = None,
        rf: float = 0.0,
        max_per_trade_slippage_bps: Optional[float] = None,
    ) -> ContractReport:
        """Run all applicable checks and return a ContractReport."""
        checks: Dict[str, CheckResult] = {}

        # Equity-based checks
        if bt_equity is not None and live_equity is not None:
            eq_bt, eq_live = self._align_equity(bt_equity, live_equity)
            checks.update(self._check_time_integrity(eq_bt, eq_live))
            checks.update(self._check_equity_alignment(eq_bt, eq_live, periods_per_year, rf))

        # Trade-based checks
        if bt_trades is not None and live_trades is not None:
            checks.update(self._check_trade_alignment(bt_trades, live_trades))

            # Slippage sanity if both have prices
            slippage_cap = (
                max_per_trade_slippage_bps
                if max_per_trade_slippage_bps is not None
                else self.thresholds.max_per_trade_slippage_bps
            )
            slp = self._check_slippage(bt_trades, live_trades, slippage_cap)
            checks["slippage_bps"] = slp

        passed = all(cr.passed for cr in checks.values()) if checks else True

        report = ContractReport(
            passed=passed,
            checks=checks,
            config={
                "thresholds": asdict(self.thresholds),
                "periods_per_year": periods_per_year,
                "rf": rf,
            },
        )
        return report

    # --------- equity checks ---------

    def _align_equity(
        self,
        bt_eq: pd.Series | np.ndarray | list[float],
        live_eq: pd.Series | np.ndarray | list[float],
    ) -> Tuple[pd.Series, pd.Series]:
        """Align two equity series by datetime intersection or trailing length."""
        bt = _to_series(bt_eq).astype(float)
        lv = _to_series(live_eq).astype(float)

        # If datetime indexed, align on intersection; else align by trailing length
        if isinstance(bt.index, pd.DatetimeIndex) and isinstance(lv.index, pd.DatetimeIndex):
            idx = bt.index.intersection(lv.index)
            bt = bt.loc[idx]
            lv = lv.loc[idx]
        else:
            n = int(min(len(bt), len(lv)))
            bt = bt.iloc[-n:]
            lv = lv.iloc[-n:]
        return bt, lv

    def _check_time_integrity(self, bt: pd.Series, lv: pd.Series) -> Dict[str, CheckResult]:
        """Check ordering/monotonicity of time index to avoid lookahead bias."""
        bt_mono = _mono(bt.index)
        lv_mono = _mono(lv.index)
        return {
            "bt_time_monotonic": CheckResult(bt_mono, bool(bt_mono), True),
            "live_time_monotonic": CheckResult(lv_mono, bool(lv_mono), True),
        }

    def _check_equity_alignment(
        self, bt: pd.Series, lv: pd.Series, periods_per_year: Optional[int], rf: float
    ) -> Dict[str, CheckResult]:
        """Compare summary metrics and tracking error between two aligned equity curves."""
        s_bt = summarize(equity=bt, rf=rf, periods_per_year=periods_per_year)
        s_lv = summarize(equity=lv, rf=rf, periods_per_year=periods_per_year)

        checks: Dict[str, CheckResult] = {}

        # CAGR
        d = _delta(s_bt.cagr, s_lv.cagr)
        checks["cagr_delta"] = CheckResult(
            d <= self.thresholds.max_cagr_delta,
            d,
            self.thresholds.max_cagr_delta,
            {"bt": float(s_bt.cagr), "live": float(s_lv.cagr)},
        )

        # MDD
        d = _delta(s_bt.max_dd, s_lv.max_dd)
        checks["maxdd_delta"] = CheckResult(
            d <= self.thresholds.max_mdd_delta,
            d,
            self.thresholds.max_mdd_delta,
            {"bt": float(s_bt.max_dd), "live": float(s_lv.max_dd)},
        )

        # Calmar
        d = _delta(s_bt.calmar, s_lv.calmar)
        checks["calmar_delta"] = CheckResult(
            d <= self.thresholds.max_calmar_delta,
            d,
            self.thresholds.max_calmar_delta,
            {"bt": float(s_bt.calmar), "live": float(s_lv.calmar)},
        )

        # Sharpe
        d = _delta(s_bt.sharpe, s_lv.sharpe)
        checks["sharpe_delta"] = CheckResult(
            d <= self.thresholds.max_sharpe_delta,
            d,
            self.thresholds.max_sharpe_delta,
            {"bt": float(s_bt.sharpe), "live": float(s_lv.sharpe)},
        )

        # Tracking error on returns
        r_bt = _returns_from_equity(bt)
        r_lv = _returns_from_equity(lv)
        n = min(len(r_bt), len(r_lv))
        mae = float(np.mean(np.abs(r_bt.iloc[-n:].values - r_lv.iloc[-n:].values))) if n > 0 else 0.0
        checks["returns_mae"] = CheckResult(
            mae <= self.thresholds.max_curve_mae, mae, self.thresholds.max_curve_mae
        )

        return checks

    # --------- trade checks ---------

    def _check_trade_alignment(self, bt_trades: pd.DataFrame, live_trades: pd.DataFrame) -> Dict[str, CheckResult]:
        """Compare hit-rate, expected R:R, and trade count between backtest and live."""
        checks: Dict[str, CheckResult] = {}

        # Hit-rate
        bt_hr = (bt_trades["pnl"] > 0).mean() if "pnl" in bt_trades else np.nan
        lv_hr = (live_trades["pnl"] > 0).mean() if "pnl" in live_trades else np.nan
        hr_delta = float(abs(bt_hr - lv_hr)) if np.isfinite(bt_hr) and np.isfinite(lv_hr) else np.nan
        checks["hit_rate_delta"] = CheckResult(
            bool(np.isfinite(hr_delta)) and hr_delta <= self.thresholds.max_hitrate_delta,
            hr_delta,
            self.thresholds.max_hitrate_delta,
            {
                "bt": float(bt_hr) if np.isfinite(bt_hr) else None,
                "live": float(lv_hr) if np.isfinite(lv_hr) else None,
            },
        )

        # Expected R:R approximated by avg win / avg loss magnitude
        bt_rr = _exp_rr_from_trades(bt_trades) if "pnl" in bt_trades else np.nan
        lv_rr = _exp_rr_from_trades(live_trades) if "pnl" in live_trades else np.nan
        rr_delta = float(abs(bt_rr - lv_rr)) if np.isfinite(bt_rr) and np.isfinite(lv_rr) else np.nan
        checks["exp_rr_delta"] = CheckResult(
            bool(np.isfinite(rr_delta)) and rr_delta <= self.thresholds.max_exrr_delta,
            rr_delta,
            self.thresholds.max_exrr_delta,
            {
                "bt": float(bt_rr) if np.isfinite(bt_rr) else None,
                "live": float(lv_rr) if np.isfinite(lv_rr) else None,
            },
        )

        # Trade count sanity
        tc_delta = int(abs(len(bt_trades) - len(live_trades)))
        checks["trade_count_delta"] = CheckResult(
            tc_delta <= self.thresholds.max_trade_count_delta,
            tc_delta,
            self.thresholds.max_trade_count_delta,
            {"bt_count": int(len(bt_trades)), "live_count": int(len(live_trades))},
        )

        return checks

    # --------- slippage checks ---------

    def _check_slippage(
        self, bt_trades: pd.DataFrame, live_trades: pd.DataFrame, max_per_trade_slippage_bps: float
    ) -> CheckResult:
        """Estimate realized slippage (bps) vs backtest; pass if ≤ cap."""
        needed_cols = {"entry_price", "exit_price"}
        if not needed_cols.issubset(bt_trades.columns) or not needed_cols.issubset(live_trades.columns):
            return CheckResult(True, None, max_per_trade_slippage_bps, {"reason": "price columns missing"})

        bt = bt_trades.copy()
        lv = live_trades.copy()

        # Align rows
        if "trade_id" in bt.columns and "trade_id" in lv.columns:
            merged = bt.set_index("trade_id").join(lv.set_index("trade_id"), how="inner", lsuffix="_bt", rsuffix="_lv")
        elif "timestamp" in bt.columns and "timestamp" in lv.columns:
            merged = (
                bt.set_index(pd.to_datetime(bt["timestamp"]))
                .join(lv.set_index(pd.to_datetime(lv["timestamp"])), how="inner", lsuffix="_bt", rsuffix="_lv")
            )
        elif isinstance(bt.index, pd.DatetimeIndex) and isinstance(lv.index, pd.DatetimeIndex):
            merged = bt.join(lv, how="inner", lsuffix="_bt", rsuffix="_lv")
        else:
            n = min(len(bt), len(lv))
            merged = pd.concat(
                [
                    bt.iloc[:n].reset_index(drop=True).add_suffix("_bt"),
                    lv.iloc[:n].reset_index(drop=True).add_suffix("_lv"),
                ],
                axis=1,
            )

        if merged.empty:
            return CheckResult(True, 0.0, max_per_trade_slippage_bps, {"reason": "no overlapping trades"})

        bt_entry = merged["entry_price_bt"].astype(float).values
        lv_entry = merged["entry_price_lv"].astype(float).values
        bt_exit = merged["exit_price_bt"].astype(float).values
        lv_exit = merged["exit_price_lv"].astype(float).values

        entry_bps = 10_000.0 * (lv_entry - bt_entry) / np.maximum(bt_entry, 1e-12)
        exit_bps = 10_000.0 * (lv_exit - bt_exit) / np.maximum(bt_exit, 1e-12)
        per_trade_slippage = np.mean(np.abs(entry_bps) + np.abs(exit_bps)) / 2.0
        value = float(per_trade_slippage)
        return CheckResult(value <= max_per_trade_slippage_bps, value, max_per_trade_slippage_bps)


# --------------------------- Schema smoke check ---------------------------- #

def run_contract_smoke() -> None:
    """Lightweight schema registration + guard smoke test (layer-safe)."""
    register(FEATURE_SCHEMA_NAME, FEATURE_SCHEMA_V, FEATURE_SCHEMA)
    register(SIGNAL_SCHEMA_NAME, SIGNAL_SCHEMA_V, SIGNAL_SCHEMA)
    _ensure_schema(
        FEATURE_SCHEMA_NAME,
        FEATURE_SCHEMA_V,
        {"symbol": "BTCUSDT", "tf": "1h", "timestamp": 0, "indicators": {"adx": 1, "atr": 1, "vwap": 1}},
    )
    _ensure_schema(
        SIGNAL_SCHEMA_NAME,
        SIGNAL_SCHEMA_V,
        {
            "signal_id": "x",
            "symbol": "BTCUSDT",
            "tf": "1h",
            "score": 0.1,
            "direction": "Neutral",
            "created_at": "2020-01-01T00:00:00Z",
        },
    )
    log.info("Contracts OK")


if __name__ == "__main__":  # pragma: no cover
    logging.basicConfig(level=logging.INFO)
    run_contract_smoke()
