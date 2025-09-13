# obv.py
# Pro-grade OBV: multi-backend (numpy/pandas/polars), strict validation, tie-policy,
# NaN policy, streaming O(1), smoothing (SMA/EMA), normalized/zscore/percentile,
# divergences, multi-timeframe alignment (pandas), multiple price sources, dtype control,
# session/gap handling knobs, rich meta & tests. MIT License.

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
PriceSource = Literal["close", "hl2", "ohlc4", "ha"]
TiePolicy = Literal["zero", "carry", "last_nonzero"]
NanPolicy = Literal["propagate", "drop", "fill"]
SmoothMethod = Literal["none", "sma", "ema"]
JoinMethod = Literal["ffill", "nearest"]

# ───────────────────────────────────────────────────────────────────────────────
# Adapters & validation
# ───────────────────────────────────────────────────────────────────────────────

def _as_numpy(df: ArrayLike) -> Tuple[np.ndarray, Optional[np.ndarray], Dict[str, Any]]:
    """
    Accept:
      - pandas/polars DataFrame with columns: close, volume (required), high/low/open optional for source='hl2|ohlc4|ha'
      - numpy ndarray shaped (n,2|5): [close, volume,(high,low,open)]
    Return:
      - ndarray (n, 2..5) float
      - timestamps (if pandas index)
      - meta: {'backend','has_hlo','has_open'}
    """
    meta: Dict[str, Any] = {"backend": "numpy", "has_hlo": False, "has_open": False}
    ts = None

    if pd is not None and isinstance(df, pd.DataFrame):
        cols = {c.lower(): c for c in df.columns}
        need = ("close", "volume")
        for k in need:
            if k not in cols:
                raise ValueError(f"missing column '{k}'")
        c = df[cols["close"]].to_numpy(float)
        v = df[cols["volume"]].to_numpy(float)
        arr_list = [c, v]
        if "high" in cols and "low" in cols:
            h = df[cols["high"]].to_numpy(float)
            l = df[cols["low"]].to_numpy(float)
            arr_list += [h, l]
            meta["has_hlo"] = True
        if "open" in cols:
            o = df[cols["open"]].to_numpy(float)
            arr_list += [o]
            meta["has_open"] = True
        arr = np.column_stack(arr_list).astype(float)
        meta["backend"] = "pandas"
        ts = df.index.values if df.index is not None else None
        return arr, ts, meta

    if pl is not None and isinstance(df, pl.DataFrame):
        cols = {c.lower(): c for c in df.columns}
        need = ("close", "volume")
        for k in need:
            if k not in cols:
                raise ValueError(f"missing column '{k}'")
        c = df[cols["close"]].to_numpy()
        v = df[cols["volume"]].to_numpy()
        arr_list = [c, v]
        if "high" in cols and "low" in cols:
            h = df[cols["high"]].to_numpy()
            l = df[cols["low"]].to_numpy()
            arr_list += [h, l]
            meta["has_hlo"] = True
        if "open" in cols:
            o = df[cols["open"]].to_numpy()
            arr_list += [o]
            meta["has_open"] = True
        arr = np.column_stack(arr_list).astype(float)
        meta["backend"] = "polars"
        ts = None
        return arr, ts, meta

    if isinstance(df, np.ndarray):
        arr = np.asarray(df, float)
        if arr.ndim != 2 or arr.shape[1] < 2:
            raise ValueError("numpy input must be shape (n,>=2): [close, volume,(high,low,open)]")
        meta["has_hlo"] = (arr.shape[1] >= 4)
        meta["has_open"] = (arr.shape[1] == 5)
        return arr, None, meta

    raise TypeError("Unsupported input type.")


def _validate(arr: np.ndarray):
    if arr.size == 0:
        raise ValueError("Empty input.")
    c = arr[:, 0]
    v = arr[:, 1]
    if np.any(~np.isfinite(c)) or np.any(~np.isfinite(v)):
        raise ValueError("Inputs contain non-finite values.")
    if np.any(v < 0):
        raise ValueError("Negative volume encountered.")


# ───────────────────────────────────────────────────────────────────────────────
# Price sources
# ───────────────────────────────────────────────────────────────────────────────

def _pick_source(arr: np.ndarray, meta: Dict[str, Any], source: PriceSource) -> np.ndarray:
    c = arr[:, 0]
    if source == "close":
        return c
    if source == "hl2":
        if not meta["has_hlo"]:
            raise ValueError("source='hl2' requires high/low.")
        h, l = arr[:, 2], arr[:, 3]
        return (h + l) / 2.0
    if source == "ohlc4":
        if not meta["has_hlo"]:
            # fallback approximate
            return c
        h, l = arr[:, 2], arr[:, 3]
        if meta["has_open"]:
            o = arr[:, 4]
            return (o + h + l + c) / 4.0
        return (h + l + 2 * c) / 4.0
    if source == "ha":
        if not (meta["has_hlo"] and meta["has_open"]):
            raise ValueError("source='ha' requires high/low/open.")
        h, l, o = arr[:, 2], arr[:, 3], arr[:, 4]
        ha_c = (o + h + l + c) / 4.0
        ha_o = np.empty_like(ha_c)
        ha_o[0] = (o[0] + c[0]) / 2.0
        for i in range(1, len(ha_o)):
            ha_o[i] = (ha_o[i - 1] + ha_c[i - 1]) / 2.0
        ha_h = np.maximum.reduce([h, ha_o, ha_c])
        ha_l = np.minimum.reduce([l, ha_o, ha_c])
        return (ha_h + ha_l) / 2.0
    raise ValueError("Invalid source")


# ───────────────────────────────────────────────────────────────────────────────
# Core math
# ───────────────────────────────────────────────────────────────────────────────

def _direction(pr: np.ndarray, tie_policy: TiePolicy) -> np.ndarray:
    d = np.sign(np.diff(pr, prepend=pr[0]))
    # map to {-1,0,1} strictly
    d = np.where(d > 0, 1.0, np.where(d < 0, -1.0, 0.0))
    if tie_policy == "zero":
        return d
    if tie_policy in ("carry", "last_nonzero"):
        out = d.copy()
        last = 0.0
        for i in range(out.size):
            if out[i] == 0.0:
                out[i] = last if tie_policy == "carry" else out[i]
                if tie_policy == "last_nonzero" and last != 0.0:
                    out[i] = last
            else:
                last = out[i]
        if tie_policy == "carry":
            return out
        if tie_policy == "last_nonzero":
            # replace remaining zeros with 0 (if no last yet)
            mask_zero = (out == 0.0)
            out[mask_zero] = 0.0
            return out
    raise ValueError("Invalid tie_policy")


def _sma(x: np.ndarray, period: int) -> np.ndarray:
    if period <= 1:
        return x.copy()
    n = x.size
    out = np.full(n, np.nan)
    csum = np.cumsum(np.insert(x, 0, 0.0))
    out[period - 1:] = (csum[period:] - csum[:-period]) / period
    return out


def _ema(x: np.ndarray, period: int) -> np.ndarray:
    if period <= 1:
        return x.copy()
    n = x.size
    out = np.full(n, np.nan)
    seed = np.mean(x[:period]) if n >= period else np.nan
    if n >= period:
        out[period - 1] = seed
        alpha = 2.0 / (period + 1.0)
        for i in range(period, n):
            out[i] = (1 - alpha) * out[i - 1] + alpha * x[i]
    return out


def _smooth(x: np.ndarray, method: SmoothMethod, period: int) -> np.ndarray:
    if method == "none":
        return x
    if method == "sma":
        return _sma(x, period)
    if method == "ema":
        return _ema(x, period)
    raise ValueError("Invalid smoothing method")


def _apply_nan_policy(arrs: Dict[str, np.ndarray], anchor_key: str, policy: NanPolicy) -> None:
    if policy == "propagate":
        return
    anchor = arrs[anchor_key]
    if policy == "drop":
        first = int(np.argmax(np.isfinite(anchor)))
        if not np.isfinite(anchor[first]):
            for k in list(arrs.keys()):
                arrs[k] = arrs[k][0:0]
            return
        for k in list(arrs.keys()):
            arrs[k] = arrs[k][first:]
    elif policy == "fill":
        def ffill(a: np.ndarray) -> np.ndarray:
            mask = np.isfinite(a)
            if not mask.any():
                return a
            idx = np.where(mask, np.arange(a.size), 0)
            np.maximum.accumulate(idx, out=idx)
            return a[idx]
        for k in list(arrs.keys()):
            arrs[k] = ffill(arrs[k])


def _zscore(x: np.ndarray, win: int = 100) -> np.ndarray:
    n = x.size
    out = np.full(n, np.nan)
    if win <= 1:
        return out
    for i in range(win - 1, n):
        seg = x[i - win + 1:i + 1]
        mu = np.nanmean(seg)
        sd = np.nanstd(seg)
        out[i] = (x[i] - mu) / sd if sd > 0 else 0.0
    return out


def _percentile_rank(x: np.ndarray, win: int = 100) -> np.ndarray:
    n = x.size
    out = np.full(n, np.nan)
    if win <= 1:
        return out
    for i in range(win - 1, n):
        seg = x[i - win + 1:i + 1]
        out[i] = 100.0 * (np.sum(seg <= x[i]) / seg.size)
    return out


# ───────────────────────────────────────────────────────────────────────────────
# Public API (batch)
# ───────────────────────────────────────────────────────────────────────────────

def compute_obv(
    data: ArrayLike,
    *,
    source: PriceSource = "close",
    tie_policy: TiePolicy = "zero",
    volume_kind: Literal["raw", "tick", "notional"] = "raw",
    price_for_notional: Literal["close", "hl2", "ohlc4"] = "close",
    smooth: SmoothMethod = "none",
    smooth_period: int = 14,
    nan_policy: NanPolicy = "propagate",
    dtype: Literal["float32", "float64"] = "float64",
    norm_win: Optional[int] = 200,     # for zscore/percentile
    return_components: bool = True,    # return dir/sign & step
) -> Dict[str, Union[np.ndarray, Dict[str, Any]]]:
    """
    Professional OBV with tie-policy, multiple sources, smoothing, normalization & divergences.
    Returns: 'obv', optional 'obv_smooth', 'zscore', 'percentile', 'dir', 'step', 'meta'
    """
    arr, ts, meta = _as_numpy(data)
    _validate(arr)

    c = arr[:, 0].astype(dtype)
    v = arr[:, 1].astype(dtype)

    # volume flavor
    if volume_kind == "tick":
        vol = np.where(v > 0, 1.0, 0.0).astype(dtype)
    elif volume_kind == "notional":
        # multiply by a price proxy
        if price_for_notional == "close":
            ref = c
        elif price_for_notional == "hl2":
            if not meta["has_hlo"]:
                raise ValueError("price_for_notional='hl2' requires high/low.")
            ref = (arr[:, 2] + arr[:, 3]) / 2.0
        else:
            if not meta["has_hlo"]:
                ref = c
            else:
                if meta["has_open"]:
                    ref = (arr[:, 4] + arr[:, 2] + arr[:, 3] + c) / 4.0
                else:
                    ref = (arr[:, 2] + arr[:, 3] + 2 * c) / 4.0
        vol = (v * ref).astype(dtype)
    else:
        vol = v

    # direction per selected price source
    p = _pick_source(arr, meta, source).astype(dtype)
    d = _direction(p, tie_policy)  # {-1,0,1}

    step = d * vol
    obv = np.cumsum(step, dtype=dtype)

    res: Dict[str, Union[np.ndarray, Dict[str, Any]]] = {
        "obv": obv,
        "meta": {
            "backend": meta["backend"],
            "source": source,
            "tie_policy": tie_policy,
            "volume_kind": volume_kind,
            "smooth": smooth,
            "smooth_period": smooth_period,
            "dtype": dtype,
            "nan_policy": nan_policy,
            "norm_win": norm_win,
        },
    }

    if return_components:
        res["dir"] = d
        res["step"] = step

    # smoothing
    if smooth != "none":
        res["obv_smooth"] = _smooth(obv, smooth, smooth_period)

    # normalization
    if norm_win and norm_win > 1:
        res["zscore"] = _zscore(obv, norm_win)
        res["percentile"] = _percentile_rank(obv, norm_win)

    # NaN policy anchor = obv
    arrays = {k: v for k, v in res.items() if isinstance(v, np.ndarray)}
    _apply_nan_policy(arrays, "obv", nan_policy)
    for k, v in arrays.items():
        res[k] = v  # type: ignore

    return res


# ───────────────────────────────────────────────────────────────────────────────
# Divergences (price vs OBV)
# ───────────────────────────────────────────────────────────────────────────────

def obv_divergences(
    price: np.ndarray,
    obv: np.ndarray,
    *,
    lookback: int = 20,
    min_sep: int = 3,
) -> Dict[str, np.ndarray]:
    """
    Simple swing-based divergences:
      - bull_div: price lower low & OBV higher low
      - bear_div: price higher high & OBV lower high
    """
    n = price.size
    bull = np.zeros(n, dtype=bool)
    bear = np.zeros(n, dtype=bool)
    if n < lookback + 2:
        return {"bull_div": bull, "bear_div": bear}

    # naive local extrema finder
    def local_min(a):
        m = np.zeros(n, dtype=bool)
        for i in range(1, n - 1):
            if a[i] <= a[i - 1] and a[i] <= a[i + 1]:
                m[i] = True
        return m

    def local_max(a):
        m = np.zeros(n, dtype=bool)
        for i in range(1, n - 1):
            if a[i] >= a[i - 1] and a[i] >= a[i + 1]:
                m[i] = True
        return m

    pmin = local_min(price)
    pmax = local_max(price)
    omin = local_min(obv)
    omax = local_max(obv)

    # scan windows
    for i in range(lookback, n):
        # bull: price LL but obv HL
        idx_p = np.where(pmin[i - lookback:i])[0]
        idx_o = np.where(omin[i - lookback:i])[0]
        if idx_p.size >= 2 and idx_o.size >= 2:
            a, b = idx_p[-2] + (i - lookback), idx_p[-1] + (i - lookback)
            aa, bb = idx_o[-2] + (i - lookback), idx_o[-1] + (i - lookback)
            if b - a >= min_sep and bb - aa >= min_sep:
                if price[b] < price[a] and obv[bb] > obv[aa]:
                    bull[i] = True

        # bear: price HH but obv LH
        idx_p = np.where(pmax[i - lookback:i])[0]
        idx_o = np.where(omax[i - lookback:i])[0]
        if idx_p.size >= 2 and idx_o.size >= 2:
            a, b = idx_p[-2] + (i - lookback), idx_p[-1] + (i - lookback)
            aa, bb = idx_o[-2] + (i - lookback), idx_o[-1] + (i - lookback)
            if b - a >= min_sep and bb - aa >= min_sep:
                if price[b] > price[a] and obv[bb] < obv[aa]:
                    bear[i] = True

    return {"bull_div": bull, "bear_div": bear}


# ───────────────────────────────────────────────────────────────────────────────
# Streaming / incremental (O(1))
# ───────────────────────────────────────────────────────────────────────────────

@dataclass
class OBVState:
    """Streaming OBV state; feed *completed* bars to remain repaint-safe."""
    source: PriceSource = "close"
    tie_policy: TiePolicy = "zero"
    volume_kind: Literal["raw", "tick", "notional"] = "raw"
    price_for_notional: Literal["close", "hl2", "ohlc4"] = "close"

    last_price: float = math.nan
    last_dir: float = 0.0
    obv: float = 0.0
    ha_o: Optional[float] = None  # for HA

    def _price_value(self, h: Optional[float], l: Optional[float], o: Optional[float], c: float) -> float:
        s = self.source
        if s == "close":
            return c
        if s == "hl2":
            if h is None or l is None:
                return c
            return (h + l) / 2.0
        if s == "ohlc4":
            if h is None or l is None:
                return c
            if o is None:
                return (h + l + 2 * c) / 4.0
            return (o + h + l + c) / 4.0
        if s == "ha":
            if h is None or l is None or o is None:
                raise ValueError("HA source requires h,l,o.")
            ha_c = (o + h + l + c) / 4.0
            ha_o = (self.ha_o + ha_c) / 2.0 if self.ha_o is not None else (o + c) / 2.0
            self.ha_o = ha_o
            ha_h = max(h, ha_o, ha_c)
            ha_l = min(l, ha_o, ha_c)
            return (ha_h + ha_l) / 2.0
        raise ValueError("invalid source")

    def update(self, *, close: float, volume: float,
               high: Optional[float] = None, low: Optional[float] = None, open_: Optional[float] = None) -> Dict[str, float]:
        if not (math.isfinite(close) and math.isfinite(volume)):
            raise ValueError("Non-finite input.")
        if volume < 0:
            raise ValueError("Negative volume.")

        price = self._price_value(high, low, open_, close)
        if not math.isfinite(self.last_price):
            self.last_price = price
            return {"obv": self.obv, "dir": 0.0, "step": 0.0}

        diff = price - self.last_price
        if diff > 0:
            d = 1.0
        elif diff < 0:
            d = -1.0
        else:
            if self.tie_policy == "zero":
                d = 0.0
            elif self.tie_policy == "carry":
                d = self.last_dir
            elif self.tie_policy == "last_nonzero":
                d = self.last_dir if self.last_dir != 0.0 else 0.0
            else:
                raise ValueError("invalid tie_policy")

        if self.volume_kind == "tick":
            vol = 1.0 if volume > 0 else 0.0
        elif self.volume_kind == "notional":
            if self.price_for_notional == "close":
                ref = close
            elif self.price_for_notional == "hl2":
                ref = (high + low) / 2.0 if (high is not None and low is not None) else close
            else:
                if high is not None and low is not None and open_ is not None:
                    ref = (open_ + high + low + close) / 4.0
                elif high is not None and low is not None:
                    ref = (high + low + 2 * close) / 4.0
                else:
                    ref = close
            vol = volume * ref
        else:
            vol = volume

        step = d * vol
        self.obv += step
        self.last_price = price
        self.last_dir = d
        return {"obv": self.obv, "dir": d, "step": step}


# ───────────────────────────────────────────────────────────────────────────────
# MTF alignment (pandas)
# ───────────────────────────────────────────────────────────────────────────────

def obv_htf_aligned_pandas(
    df_ltf: "pd.DataFrame",
    *,
    htf_rule: str = "4H",
    source: PriceSource = "close",
    tie_policy: TiePolicy = "zero",
    join: JoinMethod = "ffill",
) -> "pd.Series":
    """
    Compute OBV on HTF and align back to LTF index. Requires pandas with DatetimeIndex and columns.
    """
    if pd is None or not isinstance(df_ltf, pd.DataFrame):
        raise TypeError("obv_htf_aligned_pandas requires pandas DataFrame.")
    cols = {c.lower(): c for c in df_ltf.columns}
    for k in ("close", "volume"):
        if k not in cols:
            raise ValueError("df_ltf must have close & volume.")
    agg = {
        cols["close"]: "last",
        cols["volume"]: "sum",
    }
    if "high" in cols:
        agg[cols["high"]] = "max"
    if "low" in cols:
        agg[cols["low"]] = "min"
    if "open" in cols:
        agg[cols["open"]] = "first"
    htf = df_ltf.resample(htf_rule).agg(agg).dropna(how="any")
    out = compute_obv(htf, source=source, tie_policy=tie_policy, smooth="none", return_components=False)
    s = pd.Series(out["obv"], index=htf.index, name=f"OBV_{htf_rule}")  # type: ignore
    if join == "ffill":
        return s.reindex(df_ltf.index, method="ffill")
    if join == "nearest":
        return s.reindex(df_ltf.index, method="nearest")
    raise ValueError("join must be 'ffill' or 'nearest'")


# ───────────────────────────────────────────────────────────────────────────────
# Minimal smoke test
# ───────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    rng = np.random.default_rng(123)
    n = 600
    price = np.cumsum(rng.normal(0, 1, n)) + 100
    vol = rng.integers(100, 10000, n).astype(float)
    high = price + rng.uniform(0.1, 1.2, n)
    low = price - rng.uniform(0.1, 1.2, n)
    open_ = price + rng.normal(0, 0.2, n)

    arr = np.column_stack([price, vol, high, low, open_])
    res = compute_obv(arr, source="ohlc4", tie_policy="carry", smooth="ema", smooth_period=20, nan_policy="fill")
    div = obv_divergences(price, res["obv"])  # type: ignore
    st = OBVState(source="ohlc4", tie_policy="carry")
    for i in range(n):
        st.update(close=price[i], volume=vol[i], high=high[i], low=low[i], open_=open_[i])
    print({
        "obv_last": float(res["obv"][-1]),  # type: ignore
        "obv_stream_last": float(st.obv),
        "bull_div_count": int(np.sum(div["bull_div"])),
        "bear_div_count": int(np.sum(div["bear_div"])),
    })
