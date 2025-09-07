# Module implemented per architecture; see README for usage.
"""
backtesting/metrics.py

Portfolio & trade performance metrics:
- Sharpe
- Sortino
- Calmar
- Max Drawdown
- Hit Rate
- Expected R:R (avg win / avg loss)
- CAGR, Volatility helpers

Design goals:
- Pure functions with type hints
- Robust to NaNs and zero-length edge cases
- Works with either returns Series or equity curve Series
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np
import pandas as pd


Number = float | int | np.number


# ---------- helpers ----------

def _to_series(x: pd.Series | pd.DataFrame | np.ndarray | list[Number]) -> pd.Series:
    """Convert various 1D-like inputs into a Pandas Series.

    Accepts: Series, single-column DataFrame, numpy array, or list of numbers.
    Raises:
        ValueError: if a DataFrame with more than one column is provided.
    """
    if isinstance(x, pd.Series):
        return x
    if isinstance(x, pd.DataFrame):
        if x.shape[1] != 1:
            raise ValueError("DataFrame must have exactly one column to convert to Series")
        return x.iloc[:, 0]
    return pd.Series(x)


def _nan_safe(series: pd.Series) -> pd.Series:
    """Return a float Series with infs converted to NaN and NaNs dropped."""
    return _to_series(series).astype(float).replace([np.inf, -np.inf], np.nan).dropna()


def _returns_from_equity(equity: pd.Series) -> pd.Series:
    """Compute simple returns from an equity curve as pct_change(), dropping NaNs."""
    s = _nan_safe(equity)
    return s.pct_change().dropna()


def _equity_from_returns(returns: pd.Series, initial_equity: Number = 1.0) -> pd.Series:
    """Reconstruct an equity curve from per-period returns.

    Args:
        returns: per-period returns (simple returns, not log)
        initial_equity: starting equity level (default 1.0)
    """
    r = _nan_safe(returns)
    return (1 + r).cumprod() * float(initial_equity)


def _annualization_factor(periods_per_year: Optional[int], index: Optional[pd.Index]) -> float:
    """Infer periods-per-year for annualization.

    Priority:
      1) If periods_per_year is provided, use it.
      2) If index is a DatetimeIndex with length > 1, infer frequency.
      3) Fallback to 252 trading days.
    """
    if periods_per_year is not None:
        return float(periods_per_year)
    # infer from DatetimeIndex if possible
    if isinstance(index, pd.DatetimeIndex) and len(index) > 1:
        # average count per year
        days = (index[-1] - index[0]).days
        if days <= 0:
            return 252.0
        freq = len(index) / (days / 365.2425)
        return float(freq)
    return 252.0  # default to trading days


# ---------- metrics ----------

def max_drawdown(equity: pd.Series | np.ndarray | list[Number]) -> Tuple[float, int, int]:
    """
    Max Drawdown (as positive fraction, e.g., 0.25 for -25%),
    along with (start_idx, end_idx) integer positions of the window.
    """
    s = _to_series(equity).astype(float)
    s = s.replace([np.inf, -np.inf], np.nan).fillna(method="ffill").dropna()
    if s.empty:
        return 0.0, -1, -1
    peaks = s.cummax()
    dd = (s - peaks) / peaks
    end = int(dd.idxmin()) if isinstance(dd.index, pd.RangeIndex) else dd.values.argmin()
    # Handle index types gracefully
    if not isinstance(dd.index, pd.RangeIndex):
        end_pos = int(np.argmin(dd.values))
    else:
        end_pos = int(np.argmin(dd.values))
    start_pos = int(np.argmax(s.values[: end_pos + 1]))
    mdd = float(-dd.values[end_pos])
    return mdd, start_pos, end_pos


def sharpe_ratio(
    returns: pd.Series | np.ndarray | list[Number],
    rf: float = 0.0,
    periods_per_year: Optional[int] = None,
    use_downside_vol: bool = False,
) -> float:
    """Annualized Sharpe. If use_downside_vol=True, denominator uses downside deviation."""
    r = _nan_safe(_to_series(returns))
    if r.empty:
        return 0.0
    excess = r - rf / _annualization_factor(periods_per_year, getattr(r, "index", None))
    if use_downside_vol:
        downside = r[r < 0.0]
        denom = downside.std(ddof=0)
    else:
        denom = r.std(ddof=0)
    if denom == 0 or np.isnan(denom):
        return 0.0
    af = _annualization_factor(periods_per_year, getattr(r, "index", None))
    return float((excess.mean() / denom) * np.sqrt(af))


def sortino_ratio(
    returns: pd.Series | np.ndarray | list[Number],
    rf: float = 0.0,
    periods_per_year: Optional[int] = None,
    target: float = 0.0,
) -> float:
    """Annualized Sortino Ratio using downside deviation vs. target (per-period)."""
    r = _nan_safe(_to_series(returns))
    if r.empty:
        return 0.0
    af = _annualization_factor(periods_per_year, getattr(r, "index", None))
    excess = r - (rf / af) - target
    downside = excess[excess < 0.0]
    dd = downside.std(ddof=0)
    if dd == 0 or np.isnan(dd):
        return 0.0
    return float((excess.mean() / dd) * np.sqrt(af))


def cagr_from_equity(
    equity: pd.Series | np.ndarray | list[Number],
    periods_per_year: Optional[int] = None,
) -> float:
    """Compound Annual Growth Rate given an equity curve."""
    eq = _nan_safe(_to_series(equity))
    if eq.empty:
        return 0.0
    af = _annualization_factor(periods_per_year, getattr(eq, "index", None))
    total_return = float(eq.iloc[-1] / eq.iloc[0]) - 1.0
    n_periods = max(len(eq) - 1, 1)
    years = n_periods / af
    if years <= 0:
        return 0.0
    return float((1.0 + total_return) ** (1.0 / years) - 1.0)


def calmar_ratio(
    equity: pd.Series | np.ndarray | list[Number],
    periods_per_year: Optional[int] = None,
) -> float:
    """Calmar = CAGR / MaxDrawdown (with MaxDD as positive fraction)."""
    cagr = cagr_from_equity(equity, periods_per_year=periods_per_year)
    mdd, _, _ = max_drawdown(equity)
    if mdd == 0.0:
        return np.inf if cagr > 0 else 0.0
    return float(cagr / mdd)


def hit_rate(trade_pnls: pd.Series | np.ndarray | list[Number]) -> float:
    """Fraction of winning trades (strictly > 0)."""
    s = _nan_safe(_to_series(trade_pnls))
    if s.empty:
        return 0.0
    wins = (s > 0).sum()
    return float(wins / len(s))


def expected_rr(trade_pnls: pd.Series | np.ndarray | list[Number]) -> float:
    """
    Expected Reward:Risk = avg(win size) / avg(loss size).
    Loss size is the absolute value of negative PnLs.
    Returns np.inf if there are wins and no losses.
    """
    s = _nan_safe(_to_series(trade_pnls))
    if s.empty:
        return 0.0
    wins = s[s > 0]
    losses = -s[s < 0]  # positive magnitudes
    if len(wins) == 0 and len(losses) == 0:
        return 0.0
    if len(losses) == 0:
        return np.inf
    if len(wins) == 0:
        return 0.0
    return float(wins.mean() / losses.mean())


@dataclass(frozen=True)
class Summary:
    """Container of common performance metrics used across the platform."""
    sharpe: float
    sortino: float
    calmar: float
    max_dd: float
    hit_rate: float
    exp_rr: float
    cagr: float
    vol_annualized: float


def volatility_annualized(
    returns: pd.Series | np.ndarray | list[Number],
    periods_per_year: Optional[int] = None,
) -> float:
    """Annualized volatility (standard deviation) of per-period returns."""
    r = _nan_safe(_to_series(returns))
    if r.empty:
        return 0.0
    af = _annualization_factor(periods_per_year, getattr(r, "index", None))
    return float(r.std(ddof=0) * np.sqrt(af))


def summarize(
    equity: pd.Series | np.ndarray | list[Number] | None = None,
    returns: pd.Series | np.ndarray | list[Number] | None = None,
    trade_pnls: pd.Series | np.ndarray | list[Number] | None = None,
    rf: float = 0.0,
    periods_per_year: Optional[int] = None,
    sortino_target: float = 0.0,
) -> Summary:
    """
    Flexible summary: pass either equity OR returns (equity takes precedence if both given),
    and optionally trade PnLs for hit-rate and expected R:R.
    """
    if equity is None and returns is None:
        raise ValueError("Provide equity or returns")
    if equity is not None:
        eq = _to_series(equity)
        rets = _returns_from_equity(eq)
    else:
        rets = _to_series(returns)
        eq = _equity_from_returns(rets, initial_equity=1.0)

    sharpe = sharpe_ratio(rets, rf=rf, periods_per_year=periods_per_year)
    sortino = sortino_ratio(rets, rf=rf, periods_per_year=periods_per_year, target=sortino_target)
    calmar = calmar_ratio(eq, periods_per_year=periods_per_year)
    mdd, _, _ = max_drawdown(eq)
    cagr = cagr_from_equity(eq, periods_per_year=periods_per_year)
    vol_ann = volatility_annualized(rets, periods_per_year=periods_per_year)

    hr = expected = 0.0
    if trade_pnls is not None:
        hr = hit_rate(trade_pnls)
        expected = expected_rr(trade_pnls)

    return Summary(
        sharpe=sharpe,
        sortino=sortino,
        calmar=calmar,
        max_dd=mdd,
        hit_rate=hr,
        exp_rr=expected,
        cagr=cagr,
        vol_annualized=vol_ann,
    )
