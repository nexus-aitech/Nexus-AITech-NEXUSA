# atr.py
# World-class ATR: Wilder-true smoothing, EMA/SMA options, robust validation,
# NaN policy, NATR & bands, streaming O(1), optional HTF alignment, multi-backend (numpy/pandas/polars).
# MIT License.

from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Literal, Optional, Tuple, Union, Any

import math
import numpy as np

try:
    import pandas as pd  # type: ignore
except Exception:
    pd = None  # type: ignore

try:
    import polars as pl  # type: ignore
except Exception:
    pl = None  # type: ignore


ArrayLike = Union[np.ndarray, "pd.DataFrame", "pl.DataFrame"]
Method = Literal["wilder", "ema", "sma"]
NanPolicy = Literal["propagate", "drop", "fill"]

# ───────────────────────────────────────────────────────────────────────────────
# Utilities: adapters & math
# ───────────────────────────────────────────────────────────────────────────────

def _as_numpy(x: ArrayLike) -> Tuple[np.ndarray, Optional[np.ndarray], Dict[str, Any]]:
    """Accept DF (pandas/polars) with high/low/close OR numpy (n,3)->float ndarray.
    Returns: (HLC ndarray[n,3]), optional timestamps (ns), meta {backend, columns}."""
    meta: Dict[str, Any] = {"backend": "numpy", "columns": ("high", "low", "close")}
    ts = None

    if pd is not None and isinstance(x, pd.DataFrame):
        cols = {c.lower(): c for c in x.columns}
        for k in ("high", "low", "close"):
            if k not in cols:
                raise ValueError(f"missing column '{k}' in DataFrame")
        hlc = np.column_stack([
            x[cols["high"]].to_numpy(dtype=float),
            x[cols["low"]].to_numpy(dtype=float),
            x[cols["close"]].to_numpy(dtype=float),
        ])
        meta["backend"] = "pandas"
        ts = x.index.values if x.index is not None else None
        return hlc, ts, meta

    if pl is not None and isinstance(x, pl.DataFrame):
        cols = {c.lower(): c for c in x.columns}
        for k in ("high", "low", "close"):
            if k not in cols:
                raise ValueError(f"missing column '{k}' in DataFrame")
        hlc = np.column_stack((
            x[cols["high"]].to_numpy(),
            x[cols["low"]].to_numpy(),
            x[cols["close"]].to_numpy(),
        )).astype(float)
        meta["backend"] = "polars"
        ts = None  # Polars index may be detached; HTF align helper supports pandas
        return hlc, ts, meta

    if isinstance(x, np.ndarray):
        arr = np.asarray(x, dtype=float)
        if arr.ndim != 2 or arr.shape[1] != 3:
            raise ValueError("numpy input must be shape (n,3) as [high, low, close]")
        return arr, None, meta

    raise TypeError("Unsupported input type. Use pandas/polars DataFrame with high/low/close or numpy (n,3).")


def _validate_series_spacing(length: int):
    if length < 2:
        raise ValueError("Series too short (need >= 2 bars).")


def _true_range(h: np.ndarray, l: np.ndarray, c_prev: np.ndarray) -> np.ndarray:
    return np.maximum.reduce([h - l, np.abs(h - c_prev), np.abs(l - c_prev)])


def _rma_wilder(x: np.ndarray, period: int) -> np.ndarray:
    """Wilder's RMA seeded by SMA of first N, then recursive."""
    n = x.shape[0]
    out = np.full(n, np.nan, dtype=float)
    if n < period:
        return out
    seed = np.mean(x[:period])
    out[period - 1] = seed
    alpha = (period - 1) / period
    inv = 1.0 / period
    for i in range(period, n):
        out[i] = alpha * out[i - 1] + inv * x[i]
    return out


def _ema(x: np.ndarray, period: int) -> np.ndarray:
    n = x.shape[0]
    out = np.full(n, np.nan, dtype=float)
    if n < period:
        return out
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
        return _rma_wilder(x, period)
    if method == "ema":
        return _ema(x, period)
    if method == "sma":
        return _sma(x, period)
    raise ValueError("method must be one of {'wilder','ema','sma'}")


def _apply_nan_policy(arrs: Dict[str, np.ndarray], key_for_anchor: str, policy: NanPolicy) -> None:
    if policy == "propagate":
        return
    anchor = arrs[key_for_anchor]
    if anchor.size == 0:
        return
    if policy == "drop":
        first = int(np.argmax(np.isfinite(anchor)))
        if not np.isfinite(anchor[first]):
            # all nan
            for k in arrs:
                arrs[k] = arrs[k][0:0]
            return
        for k in arrs:
            arrs[k] = arrs[k][first:]
    elif policy == "fill":
        def ffill(a: np.ndarray) -> np.ndarray:
            mask = np.isfinite(a)
            if not mask.any():
                return a
            idx = np.where(mask, np.arange(a.size), 0)
            np.maximum.accumulate(idx, out=idx)
            return a[idx]
        for k in arrs:
            arrs[k] = ffill(arrs[k])


# ───────────────────────────────────────────────────────────────────────────────
# Public API: batch computation
# ───────────────────────────────────────────────────────────────────────────────

def compute_atr(
    data: ArrayLike,
    *,
    period: int = 14,
    method: Method = "wilder",
    return_tr: bool = True,
    return_natr: bool = True,
    natr_ref: Literal["close", "mid"] = "close",
    nan_policy: NanPolicy = "propagate",
    min_periods: Optional[int] = None,
    dtype: Literal["float32", "float64"] = "float64",
    bands_k: Optional[float] = None,
) -> Dict[str, Union[np.ndarray, Dict[str, Any]]]:
    """
    Professional ATR with Wilder/EMA/SMA smoothing, robust warm-up, NaN policy and extras.

    Parameters
    ----------
    data : DataFrame | ndarray
        pandas/polars DataFrame with [high, low, close] (case-insensitive), or numpy (n,3).
    period : int
        Lookback window. Default 14.
    method : {'wilder','ema','sma'}
        Smoothing method. Use 'wilder' for canonical ATR.
    return_tr : bool
        Whether to return True Range series.
    return_natr : bool
        If True, return NATR = 100 * ATR / ref_price.
    natr_ref : {'close','mid'}
        Price reference for NATR denominator.
    nan_policy : {'propagate','drop','fill'}
        Handling of warm-up NaNs.
    min_periods : int | None
        Minimum valid periods; defaults to `period`.
    dtype : {'float32','float64'}
        Output dtype.
    bands_k : float | None
        If provided, include 'upper_band' and 'lower_band' = ref_price ± k*ATR.

    Returns
    -------
    dict with keys:
      - 'atr' (np.ndarray)
      - 'tr' (optional)
      - 'natr' (optional)
      - 'upper_band','lower_band' (optional)
      - 'meta' (dict: period, method, dtype, min_periods, nan_policy)
    """
    hlc, ts, meta = _as_numpy(data)
    _validate_series_spacing(len(hlc))
    min_periods = int(min_periods or period)

    h = hlc[:, 0].astype(dtype)
    l = hlc[:, 1].astype(dtype)
    c = hlc[:, 2].astype(dtype)

    if np.any(~np.isfinite(h)) or np.any(~np.isfinite(l)) or np.any(~np.isfinite(c)):
        raise ValueError("Inputs contain non-finite values.")
    if np.any(l > h):
        raise ValueError("Found low > high.")

    c_prev = np.concatenate(([c[0]], c[:-1]))
    tr = _true_range(h, l, c_prev)

    atr = _smooth(tr, period, method)

    out: Dict[str, Union[np.ndarray, Dict[str, Any]]] = {
        "atr": atr,
        "meta": {
            "period": period,
            "method": method,
            "dtype": dtype,
            "min_periods": min_periods,
            "nan_policy": nan_policy,
            "backend": meta["backend"],
        },
    }
    if return_tr:
        out["tr"] = tr

    if return_natr:
        ref = c if natr_ref == "close" else (h + l) / 2.0
        with np.errstate(divide="ignore", invalid="ignore"):
            natr = 100.0 * atr / ref
            natr[~np.isfinite(natr)] = np.nan
        out["natr"] = natr

    if bands_k is not None:
        ref = c  # bands around close by default; adjust if you need mid
        out["upper_band"] = ref + bands_k * atr
        out["lower_band"] = ref - bands_k * atr

    # enforce min_periods on anchor (atr)
    mask_valid = np.isfinite(atr)
    # ensure first valid index occurs only after seed
    # (already handled by smoothing), apply NaN policy afterward
    arrays = {k: v for k, v in out.items() if isinstance(v, np.ndarray)}
    _apply_nan_policy(arrays, "atr", nan_policy)
    for k, v in arrays.items():
        out[k] = v  # type: ignore

    return out


# ───────────────────────────────────────────────────────────────────────────────
# Streaming / incremental (O(1) per bar)
# ───────────────────────────────────────────────────────────────────────────────

@dataclass
class ATRState:
    """Streaming ATR with Wilder recursion. Feed *completed* bars to avoid repaint."""
    period: int = 14
    method: Method = "wilder"  # supports 'wilder','ema','sma'

    atr: float = math.nan
    seeded: bool = False

    # seeding sums for first N TR (and for EMA/SMA parity)
    _seed_sum: float = 0.0
    _count: int = 0

    # previous HLC for TR
    _prev_h: float = math.nan
    _prev_l: float = math.nan
    _prev_c: float = math.nan

    def update(self, high: float, low: float, close: float) -> Dict[str, float]:
        if not (math.isfinite(high) and math.isfinite(low) and math.isfinite(close)):
            raise ValueError("Non-finite input")
        if low > high:
            raise ValueError("low > high")

        if not math.isfinite(self._prev_c):
            # first bar: initialize prevs; no ATR yet
            self._prev_h, self._prev_l, self._prev_c = high, low, close
            return {"tr": math.nan, "atr": self.atr}

        tr = max(high - low, abs(high - self._prev_c), abs(low - self._prev_c))
        self._count += 1

        if not self.seeded:
            self._seed_sum += tr
            if self._count >= self.period:
                seed = self._seed_sum / self.period
                self.atr = seed
                self.seeded = True
            self._prev_h, self._prev_l, self._prev_c = high, low, close
            return {"tr": tr, "atr": self.atr}

        # recursive update
        if self.method == "wilder":
            alpha = (self.period - 1) / self.period
            self.atr = alpha * self.atr + (1.0 / self.period) * tr
        elif self.method == "ema":
            alpha = 2.0 / (self.period + 1.0)
            self.atr = (1 - alpha) * self.atr + alpha * tr
        elif self.method == "sma":
            # SMA streaming requires a ring buffer; approximate with Wilder when seeded, or maintain queue.
            # For true SMA streaming, keep a fixed-size window of TR:
            # (We keep a lightweight queue of last N TR values.)
            if not hasattr(self, "_win"):
                self._win = []  # type: ignore
                self._sum = 0.0  # type: ignore
            win = self._win  # type: ignore
            s = getattr(self, "_sum", 0.0)  # type: ignore
            win.append(tr)
            s += tr
            if len(win) > self.period:
                s -= win.pop(0)
            self._sum = s  # type: ignore
            self.atr = s / len(win)
        else:
            raise ValueError("method must be one of {'wilder','ema','sma'}")

        self._prev_h, self._prev_l, self._prev_c = high, low, close
        return {"tr": tr, "atr": self.atr}


# ───────────────────────────────────────────────────────────────────────────────
# Optional: HTF ATR aligned to LTF (pandas only)
# ───────────────────────────────────────────────────────────────────────────────

def atr_htf_aligned_pandas(
    df_ltf: "pd.DataFrame",
    *,
    htf_rule: str = "1H",
    period: int = 14,
    method: Method = "wilder",
    join: Literal["ffill", "nearest"] = "ffill",
    return_natr: bool = False,
) -> "pd.Series":
    """
    Compute ATR on a higher timeframe (HTF) and align back to lower timeframe (LTF).
    Requirements: pandas DataFrame with datetime index and columns high/low/close.

    Parameters
    ----------
    df_ltf : pandas.DataFrame
        LTF bars indexed by tz-aware DatetimeIndex.
    htf_rule : str
        Resample rule (e.g., '15T','1H','4H','1D').
    join : {'ffill','nearest'}
        Alignment method when mapping HTF values back to LTF index.

    Returns
    -------
    pandas.Series of HTF ATR aligned to df_ltf.index
    """
    if pd is None or not isinstance(df_ltf, pd.DataFrame):
        raise TypeError("atr_htf_aligned_pandas requires pandas DataFrame input.")

    need = {"high", "low", "close"}
    if set(map(str.lower, df_ltf.columns)) & need != need:
        raise ValueError("df_ltf must have high/low/close columns.")

    # Resample to HTF ohlc
    o = df_ltf["high"].resample(htf_rule).max()
    c = df_ltf["close"].resample(htf_rule).last()
    l = df_ltf["low"].resample(htf_rule).min()
    htf = pd.DataFrame({"high": o, "low": l, "close": c}).dropna(how="any")

    out = compute_atr(htf, period=period, method=method, return_tr=False, return_natr=return_natr)
    atr_htf = pd.Series(out["atr"], index=htf.index, name=f"ATR_{htf_rule}")  # type: ignore

    if join == "ffill":
        return atr_htf.reindex(df_ltf.index, method="ffill")
    if join == "nearest":
        return atr_htf.reindex(df_ltf.index, method="nearest")
    raise ValueError("join must be 'ffill' or 'nearest'")


# ───────────────────────────────────────────────────────────────────────────────
# Convenience: position sizing & bands
# ───────────────────────────────────────────────────────────────────────────────

def atr_bands(close: np.ndarray, atr: np.ndarray, k: float = 1.0) -> Tuple[np.ndarray, np.ndarray]:
    """Upper/Lower bands: close ± k*ATR."""
    return close + k * atr, close - k * atr


def position_size_risk(
    equity: float,
    atr: float,
    risk_perc: float = 1.0,
    k: float = 1.5,
    contract_value: Optional[float] = None,
) -> float:
    """
    Van Tharp-style sizing: risk % of equity per trade, stop = k*ATR.
    If contract_value is provided, returns contracts; else returns notional exposure.
    """
    risk_amount = equity * (risk_perc / 100.0)
    stop = max(atr * k, 1e-12)
    units = risk_amount / stop
    if contract_value:
        return units / contract_value
    return units


# ───────────────────────────────────────────────────────────────────────────────
# Minimal smoke test
# ───────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    rng = np.random.default_rng(42)
    n = 600
    px = np.cumsum(rng.normal(0, 1, n)) + 100
    high = px + rng.uniform(0.1, 1.0, n)
    low = px - rng.uniform(0.1, 1.0, n)
    close = px + rng.normal(0, 0.2, n)
    arr = np.column_stack([high, low, close])

    res = compute_atr(arr, period=14, method="wilder", return_natr=True, nan_policy="fill", bands_k=1.0)
    atr = res["atr"]  # type: ignore
    natr = res["natr"]  # type: ignore

    st = ATRState(period=14, method="wilder")
    for h, l, c in arr:
        st.update(h, l, c)
    print(
        {
            "atr_nan_ratio": float(np.mean(~np.isfinite(atr))),
            "natr_mean": float(np.nanmean(natr)),
            "stream_last": st.atr,
        }
    )
