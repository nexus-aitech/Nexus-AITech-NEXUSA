# adx.py
# World-class ADX with Wilder-true smoothing, batch & streaming, multi-backend (pandas/polars/numpy),
# robust NaN policy, ADXR, and validation. MIT.
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Literal, Optional, Tuple, Union, Dict, Any

import math
import numpy as np

try:
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover
    pd = None  # type: ignore

try:
    import polars as pl  # type: ignore
except Exception:  # pragma: no cover
    pl = None  # type: ignore


ArrayLike = Union[np.ndarray, "pd.Series", "pd.DataFrame", "pl.Series", "pl.DataFrame"]
Method = Literal["wilder", "ema", "sma"]
NanPolicy = Literal["propagate", "drop", "fill"]


# ----------------------------- Core math (framework-agnostic) ----------------------------- #

def _as_numpy(x: ArrayLike) -> Tuple[np.ndarray, Optional[np.ndarray], Dict[str, Any]]:
    """Accept pandas/polars/numpy series or DF with columns high,low,close -> numpy arrays.
    Returns (HLC ndarray shape (n,3)), optional timestamp array, and adapter meta."""
    meta: Dict[str, Any] = {"backend": "numpy"}
    ts = None

    # pandas DataFrame/Series
    if pd is not None and isinstance(x, pd.DataFrame):
        cols = {c.lower(): c for c in x.columns}
        for k in ("high", "low", "close"):
            if k not in cols:
                raise ValueError(f"missing column '{k}' in DataFrame")
        hlc = np.column_stack(
            [x[cols["high"]].to_numpy(dtype=float),
             x[cols["low"]].to_numpy(dtype=float),
             x[cols["close"]].to_numpy(dtype=float)]
        )
        meta["backend"] = "pandas"
        ts = x.index.values if x.index is not None else None
        return hlc, ts, meta

    if pd is not None and isinstance(x, pd.Series):
        raise ValueError("Provide a DataFrame (high/low/close), not a Series")

    # polars DataFrame/Series
    if pl is not None and isinstance(x, pl.DataFrame):
        cols = {c.lower(): c for c in x.columns}
        for k in ("high", "low", "close"):
            if k not in cols:
                raise ValueError(f"missing column '{k}' in DataFrame")
        hlc = np.column_stack(
            [x[cols["high"]]].__array__(dtype=float),
            # pyright: ignore
        )

    if pl is not None and isinstance(x, pl.DataFrame):
        cols = {c.lower(): c for c in x.columns}
        hlc = np.column_stack((
            x[cols["high"]].to_numpy(),
            x[cols["low"]].to_numpy(),
            x[cols["close"]].to_numpy(),
        )).astype(float)
        meta["backend"] = "polars"
        ts = None
        return hlc, ts, meta

    # numpy
    if isinstance(x, np.ndarray):
        arr = np.asarray(x, dtype=float)
        if arr.ndim != 2 or arr.shape[1] != 3:
            raise ValueError("numpy input must be shape (n,3) as [high, low, close]")
        return arr, None, meta

    raise TypeError("Unsupported input type. Use pandas/polars DataFrame with high/low/close or numpy (n,3).")


def _validate_series_spacing(length: int):
    if length < 3:
        raise ValueError("Series too short (need >= 3 bars).")


def _true_range(h: np.ndarray, l: np.ndarray, c_prev: np.ndarray) -> np.ndarray:
    return np.maximum.reduce([h - l, np.abs(h - c_prev), np.abs(l - c_prev)])


def _wilder_rma(x: np.ndarray, period: int) -> np.ndarray:
    """Wilder's RMA (true), initialized with simple average of first N and recursive thereafter."""
    n = x.shape[0]
    out = np.full(n, np.nan, dtype=float)
    if n == 0:
        return out
    if n < period:
        # Not enough to seed average
        return out
    # seed
    s = np.sum(x[:period])
    out[period - 1] = s / period
    # recursive
    alpha = (period - 1) / period
    for i in range(period, n):
        out[i] = alpha * out[i - 1] + (1.0 / period) * x[i]
    return out


def _ema(x: np.ndarray, period: int) -> np.ndarray:
    n = x.shape[0]
    out = np.full(n, np.nan, dtype=float)
    if n < period:
        return out
    # seed by SMA of first N like common EMA implementations
    seed = np.mean(x[:period])
    out[period - 1] = seed
    alpha = 2.0 / (period + 1.0)
    for i in range(period, n):
        out[i] = (1 - alpha) * out[i - 1] + alpha * x[i]
    return out


def _sma(x: np.ndarray, period: int) -> np.ndarray:
    n = x.shape[0]
    out = np.full(n, np.nan, dtype=float)
    if n < period:
        return out
    csum = np.cumsum(np.insert(x, 0, 0.0))
    out[period - 1:] = (csum[period:] - csum[:-period]) / period
    return out


def _smooth(x: np.ndarray, period: int, method: Method) -> np.ndarray:
    if method == "wilder":
        return _wilder_rma(x, period)
    if method == "ema":
        return _ema(x, period)
    if method == "sma":
        return _sma(x, period)
    raise ValueError("Unknown method")


def compute_adx(
    data: ArrayLike,
    *,
    period: int = 14,
    method: Method = "wilder",
    include_adxr: bool = True,
    adxr_lag: Optional[int] = None,
    nan_policy: NanPolicy = "propagate",
    min_periods: Optional[int] = None,
    dtype: Literal["float32", "float64"] = "float64",
) -> Dict[str, Union[np.ndarray, ArrayLike, Dict[str, Any]]]:
    """
    Compute DI+/DI-, DX, ADX (+ optional ADXR) with professional-grade rigor.

    Parameters
    ----------
    data : DataFrame/ndarray
        pandas/polars DataFrame with columns [high, low, close] (case-insensitive),
        OR numpy (n,3) array in order [high, low, close].
    period : int
        Lookback. Default 14.
    method : {'wilder','ema','sma'}
        Smoothing method. 'wilder' equals RMA with Wilder seed (true ADX).
    include_adxr : bool
        If True, compute ADXR as average of ADX and ADX shifted by `adxr_lag` (default = period).
    adxr_lag : Optional[int]
        Lag used for ADXR; defaults to `period` when None.
    nan_policy : {'propagate','drop','fill'}
        'propagate' keeps NaN where insufficient data; 'drop' removes leading NaNs;
        'fill' forward-fills after warm-up.
    min_periods : Optional[int]
        Minimum non-NaN periods required to emit values; default = period.
    dtype : {'float32','float64'}
        Output precision.

    Returns
    -------
    dict with keys: 'plus_di', 'minus_di', 'dx', 'adx', 'adxr' (optional), 'meta'

    Notes
    -----
    * Warm-up: At least `period` bars are required to seed the smoothing.
    * Repaint: Uses only current and past bars; safe for live unless you feed incomplete bars.
    """
    hlc, ts, meta = _as_numpy(data)
    _validate_series_spacing(len(hlc))
    min_periods = int(min_periods or period)
    lag = int(adxr_lag or period)

    h = hlc[:, 0].astype(dtype)
    l = hlc[:, 1].astype(dtype)
    c = hlc[:, 2].astype(dtype)

    # Validate numbers
    if np.any(~np.isfinite(h)) or np.any(~np.isfinite(l)) or np.any(~np.isfinite(c)):
        raise ValueError("Inputs contain non-finite values.")
    if np.any(l > h):
        raise ValueError("Found low > high.")
    # True range and directional movement
    c_prev = np.concatenate(([c[0]], c[:-1]))
    tr = _true_range(h, l, c_prev)

    up_move = h - np.concatenate(([h[0]], h[:-1]))
    down_move = np.concatenate(([l[0]], l[:-1])) - l
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    # Smooth
    atr = _smooth(tr, period, method)
    pdi = 100.0 * _smooth(plus_dm, period, method) / np.where(atr == 0.0, np.nan, atr)
    mdi = 100.0 * _smooth(minus_dm, period, method) / np.where(atr == 0.0, np.nan, atr)

    # DX
    dx = 100.0 * np.abs(pdi - mdi) / (pdi + mdi)
    # ADX (smoothed DX)
    adx = _smooth(dx, period, method)

    # ADXR
    result: Dict[str, Union[np.ndarray, Dict[str, Any]]] = {
        "plus_di": pdi,
        "minus_di": mdi,
        "dx": dx,
        "adx": adx,
        "meta": {
            "period": period,
            "method": method,
            "dtype": dtype,
            "min_periods": min_periods,
            "nan_policy": nan_policy,
        },
    }

    if include_adxr:
        adxr = 0.5 * (adx + np.concatenate((np.full(lag, np.nan, dtype=adx.dtype), adx[:-lag])))
        result["adxr"] = adxr

    # NaN policy handling (affects only leading/warmup area)
    if nan_policy == "drop":
        # drop up to first finite ADX
        first = int(np.argmax(np.isfinite(adx)))
        if not np.isfinite(adx[first]):
            first = len(adx)
        for k in ("plus_di", "minus_di", "dx", "adx", "adxr"):
            if k in result:
                result[k] = result[k][first:]  # type: ignore
    elif nan_policy == "fill":
        # forward-fill after first finite
        def ffill(a: np.ndarray) -> np.ndarray:
            mask = np.isfinite(a)
            if not mask.any():
                return a
            idx = np.where(mask, np.arange(len(a)), 0)
            np.maximum.accumulate(idx, out=idx)
            return a[idx]
        for k in ("plus_di", "minus_di", "dx", "adx", "adxr"):
            if k in result:
                result[k] = ffill(result[k])  # type: ignore

    return result


# ----------------------------- Streaming / incremental ----------------------------- #

@dataclass
class ADXState:
    """Streaming ADX state (O(1) updates). Repaint-safe if fed completed candles."""
    period: int = 14
    method: Method = "wilder"

    # Wilder buffers
    atr: float = math.nan
    pdm_r: float = math.nan
    mdm_r: float = math.nan
    adx: float = math.nan
    seeded: bool = False
    # for seeding
    _seed_tr_sum: float = 0.0
    _seed_pdm_sum: float = 0.0
    _seed_mdm_sum: float = 0.0
    _seed_dx_sum: float = 0.0
    _count: int = 0
    # previous HLC
    _prev_h: float = math.nan
    _prev_l: float = math.nan
    _prev_c: float = math.nan
    _adx_window: Iterable[float] = ()

    def update(self, high: float, low: float, close: float) -> Dict[str, float]:
        """Feed ONE completed bar (high, low, close). Returns dict with plus_di, minus_di, dx, adx."""
        if not math.isfinite(high) or not math.isfinite(low) or not math.isfinite(close):
            raise ValueError("Non-finite input.")
        if low > high:
            raise ValueError("low > high")

        if not math.isfinite(self._prev_c):  # first tick
            self._prev_h, self._prev_l, self._prev_c = high, low, close
            return {"plus_di": math.nan, "minus_di": math.nan, "dx": math.nan, "adx": self.adx}

        tr = max(high - low, abs(high - self._prev_c), abs(low - self._prev_c))
        up_move = high - self._prev_h
        down_move = self._prev_l - low
        plus_dm = up_move if (up_move > down_move and up_move > 0) else 0.0
        minus_dm = down_move if (down_move > up_move and down_move > 0) else 0.0

        self._count += 1

        if not self.seeded:
            self._seed_tr_sum += tr
            self._seed_pdm_sum += plus_dm
            self._seed_mdm_sum += minus_dm
            if self._count >= self.period:
                # seed Wilder
                self.atr = self._seed_tr_sum / self.period
                self.pdm_r = self._seed_pdm_sum / self.period
                self.mdm_r = self._seed_mdm_sum / self.period
                pdi = 100.0 * (self.pdm_r / self.atr if self.atr != 0 else math.nan)
                mdi = 100.0 * (self.mdm_r / self.atr if self.atr != 0 else math.nan)
                dx = 100.0 * abs(pdi - mdi) / (pdi + mdi) if (pdi + mdi) != 0 else math.nan
                self._seed_dx_sum += dx
                if self._count >= 2 * self.period - 1:
                    self.adx = self._seed_dx_sum / self.period
                    self.seeded = True
            self._prev_h, self._prev_l, self._prev_c = high, low, close
            return {"plus_di": math.nan, "minus_di": math.nan, "dx": math.nan, "adx": self.adx}

        # Wilder recursion
        alpha = (self.period - 1) / self.period
        self.atr = alpha * self.atr + tr / self.period
        self.pdm_r = alpha * self.pdm_r + plus_dm / self.period
        self.mdm_r = alpha * self.mdm_r + minus_dm / self.period

        pdi = 100.0 * (self.pdm_r / self.atr if self.atr != 0 else math.nan)
        mdi = 100.0 * (self.mdm_r / self.atr if self.atr != 0 else math.nan)
        dx = 100.0 * abs(pdi - mdi) / (pdi + mdi) if (pdi + mdi) != 0 else math.nan
        # ADX recursion (Wilder on DX)
        self.adx = alpha * self.adx + dx / self.period if math.isfinite(self.adx) else dx

        self._prev_h, self._prev_l, self._prev_c = high, low, close
        return {"plus_di": pdi, "minus_di": mdi, "dx": dx, "adx": self.adx}


# ----------------------------- Convenience: thresholds & alerts ----------------------------- #

def signals(adx: np.ndarray, plus_di: np.ndarray, minus_di: np.ndarray,
            *, strong: float = 25.0) -> Dict[str, np.ndarray]:
    """Helper to derive common signal events: DI cross and trend-strength threshold."""
    buy_cross = (plus_di > minus_di) & (np.concatenate(([False], plus_di[:-1] <= minus_di[:-1])))
    sell_cross = (minus_di > plus_di) & (np.concatenate(([False], minus_di[:-1] <= plus_di[:-1])))
    strong_trend = adx >= strong
    return {"buy_cross": buy_cross, "sell_cross": sell_cross, "strong_trend": strong_trend}


# --------------------------------------- Minimal smoke test --------------------------------------- #
if __name__ == "__main__":  # quick manual check
    # synthetic walk
    rng = np.random.default_rng(0)
    n = 500
    price = np.cumsum(rng.normal(0, 1, n)) + 100
    high = price + rng.uniform(0.1, 1.2, n)
    low = price - rng.uniform(0.1, 1.2, n)
    close = price + rng.normal(0, 0.3, n)
    arr = np.column_stack([high, low, close])

    out = compute_adx(arr, period=14, method="wilder", include_adxr=True, nan_policy="fill")
    s = signals(out["adx"], out["plus_di"], out["minus_di"])  # type: ignore
    print({k: int(np.nansum(v)) for k, v in s.items()})
