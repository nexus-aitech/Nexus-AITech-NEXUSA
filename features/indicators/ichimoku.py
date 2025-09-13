# ichimoku.py
# Pro-grade Ichimoku Cloud: multi-backend (numpy/pandas/polars), strict validation,
# configurable displacement, source price options (close/hl2/ohlc4/Heikin-Ashi),
# streaming O(1) with rolling deques, NaN policy, MTF alignment (pandas),
# rich outputs (cloud, distances, flags), plotting/backtest-safe variants, and signals.
# MIT License.

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, Literal, Optional, Tuple, Union, Any, Deque, List
from collections import deque
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
NanPolicy = Literal["propagate", "drop", "fill"]
Source = Literal["close", "hl2", "ohlc4", "ha"]  # Heikin-Ashi midpoint for 'ha'


# ───────────────────────────────────────────────────────────────────────────────
# Adapters & validation
# ───────────────────────────────────────────────────────────────────────────────

def _as_numpy(x: ArrayLike) -> Tuple[np.ndarray, Optional[np.ndarray], Dict[str, Any]]:
    """
    Accept:
      - pandas/polars DataFrame with columns: high, low, close (case-insensitive), optionally open for 'ha'
      - numpy ndarray shaped (n,3) as [high, low, close]
    Returns:
      - ndarray (n, 3 or 4 when open provided)
      - timestamps (if pandas index provided)
      - meta (backend, available columns)
    """
    meta: Dict[str, Any] = {"backend": "numpy", "columns": ("high", "low", "close"), "has_open": False}
    ts = None

    if pd is not None and isinstance(x, pd.DataFrame):
        cols = {c.lower(): c for c in x.columns}
        for k in ("high", "low", "close"):
            if k not in cols:
                raise ValueError("missing column '%s' in DataFrame" % k)
        has_open = "open" in cols
        meta["backend"] = "pandas"
        meta["has_open"] = has_open
        h = x[cols["high"]].to_numpy(float)
        l = x[cols["low"]].to_numpy(float)
        c = x[cols["close"]].to_numpy(float)
        if has_open:
            o = x[cols["open"]].to_numpy(float)
            arr = np.column_stack([h, l, c, o])
        else:
            arr = np.column_stack([h, l, c])
        ts = x.index.values if x.index is not None else None
        return arr, ts, meta

    if pl is not None and isinstance(x, pl.DataFrame):
        cols = {c.lower(): c for c in x.columns}
        for k in ("high", "low", "close"):
            if k not in cols:
                raise ValueError("missing column '%s' in DataFrame" % k)
        has_open = "open" in cols
        meta["backend"] = "polars"
        meta["has_open"] = has_open
        h = x[cols["high"]].to_numpy()
        l = x[cols["low"]].to_numpy()
        c = x[cols["close"]].to_numpy()
        if has_open:
            o = x[cols["open"]].to_numpy()
            arr = np.column_stack([h, l, c, o]).astype(float)
        else:
            arr = np.column_stack([h, l, c]).astype(float)
        ts = None
        return arr, ts, meta

    if isinstance(x, np.ndarray):
        arr = np.asarray(x, float)
        if arr.ndim != 2 or arr.shape[1] not in (3, 4):
            raise ValueError("numpy input must be shape (n,3|4): [high,low,close(,open)]")
        meta["has_open"] = (arr.shape[1] == 4)
        return arr, None, meta

    raise TypeError("Unsupported input. Use pandas/polars DataFrame or numpy array.")


def _validate_prices(arr: np.ndarray):
    if arr.size == 0:
        raise ValueError("Empty input.")
    h = arr[:, 0]
    l = arr[:, 1]
    c = arr[:, 2]
    if np.any(~np.isfinite(h)) or np.any(~np.isfinite(l)) or np.any(~np.isfinite(c)):
        raise ValueError("Inputs contain non-finite values.")
    if np.any(l > h):
        raise ValueError("Found low > high.")


# ───────────────────────────────────────────────────────────────────────────────
# Price sources
# ───────────────────────────────────────────────────────────────────────────────

def _heikin_ashi_ohlc(h: np.ndarray, l: np.ndarray, c: np.ndarray, o: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Return Heikin-Ashi OHLC series."""
    ha_c = (o + h + l + c) / 4.0
    ha_o = np.empty_like(ha_c)
    ha_o[0] = (o[0] + c[0]) / 2.0
    for i in range(1, len(ha_o)):
        ha_o[i] = (ha_o[i - 1] + ha_c[i - 1]) / 2.0
    ha_h = np.maximum.reduce([h, ha_o, ha_c])
    ha_l = np.minimum.reduce([l, ha_o, ha_c])
    return ha_h, ha_l, ha_c, ha_o


def _source_mid(h: np.ndarray, l: np.ndarray, c: np.ndarray, o: Optional[np.ndarray], source: Source) -> np.ndarray:
    if source == "close":
        return c
    if source == "hl2":
        return (h + l) / 2.0
    if source == "ohlc4":
        if o is None:
            # approximate with (h+l+2*c)/4 if open not available
            return (h + l + 2 * c) / 4.0
        return (o + h + l + c) / 4.0
    if source == "ha":
        if o is None:
            raise ValueError("source='ha' requires 'open' column.")
        ha_h, ha_l, ha_c, _ = _heikin_ashi_ohlc(h, l, c, o)
        return (ha_h + ha_l) / 2.0
    raise ValueError("Invalid source")


# ───────────────────────────────────────────────────────────────────────────────
# Rolling max/min via deque (O(n))
# ───────────────────────────────────────────────────────────────────────────────

def _rolling_max(a: np.ndarray, window: int) -> np.ndarray:
    n = a.size
    out = np.full(n, np.nan, float)
    if window <= 0:
        raise ValueError("window must be > 0")
    dq: Deque[int] = deque()
    for i in range(n):
        while dq and dq[0] <= i - window:
            dq.popleft()
        while dq and a[dq[-1]] <= a[i]:
            dq.pop()
        dq.append(i)
        if i >= window - 1:
            out[i] = a[dq[0]]
    return out


def _rolling_min(a: np.ndarray, window: int) -> np.ndarray:
    n = a.size
    out = np.full(n, np.nan, float)
    if window <= 0:
        raise ValueError("window must be > 0")
    dq: Deque[int] = deque()
    for i in range(n):
        while dq and dq[0] <= i - window:
            dq.popleft()
        while dq and a[dq[-1]] >= a[i]:
            dq.pop()
        dq.append(i)
        if i >= window - 1:
            out[i] = a[dq[0]]
    return out


# ───────────────────────────────────────────────────────────────────────────────
# Core computation (batch)
# ───────────────────────────────────────────────────────────────────────────────

def compute_ichimoku(
    data: ArrayLike,
    *,
    tenkan: int = 9,
    kijun: int = 26,
    senkou_b: int = 52,
    disp: int = 26,
    source: Source = "hl2",
    output_shifted: bool = True,   # True => plotting-friendly (senkou forward, chikou backward). False => backtest-safe.
    nan_policy: NanPolicy = "propagate",
    dtype: Literal["float32", "float64"] = "float64",
    include_extras: bool = True,   # distances, cloud thickness, flags
) -> Dict[str, Union[np.ndarray, Dict[str, Any]]]:
    """
    Professional Ichimoku Cloud with configurable displacement & source, multi-backend, and strict validation.

    Returns dict of:
      - 'tenkan', 'kijun', 'senkou_a', 'senkou_b', 'chikou'
      - if include_extras: 'cloud_top','cloud_bot','cloud_thickness','dist_tenkan','dist_kijun','dist_cloud'
      - 'meta' with params and backend
    """
    arr, ts, meta = _as_numpy(data)
    _validate_prices(arr)

    h = arr[:, 0].astype(dtype)
    l = arr[:, 1].astype(dtype)
    c = arr[:, 2].astype(dtype)
    o = arr[:, 3].astype(dtype) if meta.get("has_open", False) and arr.shape[1] == 4 else None

    # Price source for midline computations
    mid_h = h
    mid_l = l
    mid_c = c
    if source == "ha":
        if o is None:
            raise ValueError("Heikin-Ashi source requires 'open'.")
        ha_h, ha_l, ha_c, _ = _heikin_ashi_ohlc(h, l, c, o)
        mid_h, mid_l, mid_c = ha_h, ha_l, ha_c

    hh_tenkan = _rolling_max(mid_h, tenkan)
    ll_tenkan = _rolling_min(mid_l, tenkan)
    tenkan_line = (hh_tenkan + ll_tenkan) / 2.0

    hh_kijun = _rolling_max(mid_h, kijun)
    ll_kijun = _rolling_min(mid_l, kijun)
    kijun_line = (hh_kijun + ll_kijun) / 2.0

    # Senkou A = (Tenkan + Kijun)/2, shifted forward by disp (for plotting)
    senkou_a = (tenkan_line + kijun_line) / 2.0

    hh_sb = _rolling_max(mid_h, senkou_b)
    ll_sb = _rolling_min(mid_l, senkou_b)
    senkou_b_line = (hh_sb + ll_sb) / 2.0

    # Chikou = close shifted backward by disp (for plotting)
    chikou_line = mid_c.copy()

    # Shifts
    n = len(c)
    if output_shifted:
        # forward shift => pad tail with NaN
        senkou_a = np.concatenate([np.full(disp, np.nan, dtype=senkou_a.dtype), senkou_a])[:n]
        senkou_b_line = np.concatenate([np.full(disp, np.nan, dtype=senkou_b_line.dtype), senkou_b_line])[:n]
        chikou_line = np.concatenate([chikou_line[disp:], np.full(disp, np.nan, dtype=chikou_line.dtype)])
    else:
        # backtest-safe: DO NOT shift forward/backward (purely aligned)
        pass

    out: Dict[str, Union[np.ndarray, Dict[str, Any]]] = {
        "tenkan": tenkan_line,
        "kijun": kijun_line,
        "senkou_a": senkou_a,
        "senkou_b": senkou_b_line,
        "chikou": chikou_line,
        "meta": {
            "tenkan": tenkan,
            "kijun": kijun,
            "senkou_b": senkou_b,
            "disp": disp,
            "source": source,
            "dtype": dtype,
            "nan_policy": nan_policy,
            "backend": meta["backend"],
            "shifted": output_shifted,
        },
    }

    if include_extras:
        cloud_top = np.where(senkou_a >= senkou_b_line, senkou_a, senkou_b_line)
        cloud_bot = np.where(senkou_a >= senkou_b_line, senkou_b_line, senkou_a)
        cloud_thick = cloud_top - cloud_bot
        dist_tenkan = mid_c - tenkan_line
        dist_kijun = mid_c - kijun_line
        # distance to cloud (0 if inside)
        dist_cloud = np.where(mid_c > cloud_top, mid_c - cloud_top, np.where(mid_c < cloud_bot, mid_c - cloud_bot, 0.0))
        out.update({
            "cloud_top": cloud_top,
            "cloud_bot": cloud_bot,
            "cloud_thickness": cloud_thick,
            "dist_tenkan": dist_tenkan,
            "dist_kijun": dist_kijun,
            "dist_cloud": dist_cloud,
        })

    # NaN policy (applied w.r.t. kijun as anchor)
    if nan_policy != "propagate":
        arrays = {k: v for k, v in out.items() if isinstance(v, np.ndarray)}
        anchor = arrays["kijun"]
        if nan_policy == "drop":
            first = int(np.argmax(np.isfinite(anchor)))
            if not np.isfinite(anchor[first]):
                for k in list(arrays.keys()):
                    arrays[k] = arrays[k][0:0]
            else:
                for k in list(arrays.keys()):
                    arrays[k] = arrays[k][first:]
        elif nan_policy == "fill":
            def ffill(a: np.ndarray) -> np.ndarray:
                mask = np.isfinite(a)
                if not mask.any():
                    return a
                idx = np.where(mask, np.arange(a.size), 0)
                np.maximum.accumulate(idx, out=idx)
                return a[idx]
            for k in list(arrays.keys()):
                arrays[k] = ffill(arrays[k])
        for k, v in arrays.items():
            out[k] = v  # type: ignore

    return out


# ───────────────────────────────────────────────────────────────────────────────
# Signals & scoring
# ───────────────────────────────────────────────────────────────────────────────

def ichimoku_signals(tenkan: np.ndarray, kijun: np.ndarray,
                     senkou_a: np.ndarray, senkou_b: np.ndarray,
                     chikou: np.ndarray, price_close: np.ndarray,
                     *, strong_cloud_th: float = 0.0) -> Dict[str, np.ndarray]:
    """
    Derive common Ichimoku signals (vectorized):
      - tk_bull/tk_bear cross
      - kumo_break_up/down (price vs cloud)
      - kumo_twist (senkou_a vs senkou_b)
      - chikou_confirm (chikou vs price shifted back)
      - bull/bear regime flags relative to cloud
    """
    # TK cross
    prev_tk = (tenkan[:-1] - kijun[:-1])
    curr_tk = (tenkan[1:] - kijun[1:])
    tk_bull = np.concatenate([[False]], (prev_tk <= 0) & (curr_tk > 0))
    tk_bear = np.concatenate([[False]], (prev_tk >= 0) & (curr_tk < 0))

    # Cloud topology
    cloud_top = np.where(senkou_a >= senkou_b, senkou_a, senkou_b)
    cloud_bot = np.where(senkou_a >= senkou_b, senkou_b, senkou_a)

    # Price vs cloud (breakouts)
    prev_above = price_close[:-1] > cloud_top[:-1]
    prev_below = price_close[:-1] < cloud_bot[:-1]
    now_above = price_close > cloud_top
    now_below = price_close < cloud_bot
    kumo_break_up = np.concatenate([[False]], (~prev_above) & now_above[1:])
    kumo_break_down = np.concatenate([[False]], (~prev_below) & now_below[1:])

    # Kumo twist (A vs B cross)
    prev_twist = (senkou_a[:-1] - senkou_b[:-1])
    curr_twist = (senkou_a[1:] - senkou_b[1:])
    kumo_twist_bull = np.concatenate([[False]], (prev_twist <= 0) & (curr_twist > 0))
    kumo_twist_bear = np.concatenate([[False]], (prev_twist >= 0) & (curr_twist < 0))

    # Chikou confirmation (chikou vs price shifted back one)
    # Assumes chikou aligned with price index (if plotting-shifted, align before use)
    chikou_conf_bull = chikou > price_close
    chikou_conf_bear = chikou < price_close

    # Regimes
    bull_regime = price_close >= cloud_top
    bear_regime = price_close <= cloud_bot
    inside_cloud = (~bull_regime) & (~bear_regime)

    # Optional strong trend by cloud thickness
    cloud_thickness = cloud_top - cloud_bot
    strong_bull = bull_regime & (cloud_thickness >= strong_cloud_th)
    strong_bear = bear_regime & (cloud_thickness >= strong_cloud_th)

    return {
        "tk_bull": tk_bull,
        "tk_bear": tk_bear,
        "kumo_break_up": kumo_break_up,
        "kumo_break_down": kumo_break_down,
        "kumo_twist_bull": kumo_twist_bull,
        "kumo_twist_bear": kumo_twist_bear,
        "chikou_conf_bull": chikou_conf_bull,
        "chikou_conf_bear": chikou_conf_bear,
        "bull_regime": bull_regime,
        "bear_regime": bear_regime,
        "inside_cloud": inside_cloud,
        "strong_bull": strong_bull,
        "strong_bear": strong_bear,
    }


# ───────────────────────────────────────────────────────────────────────────────
# Streaming / Incremental (O(1) per bar)
# ───────────────────────────────────────────────────────────────────────────────

@dataclass
class _MonotonicWindow:
    """Maintain rolling max/min using deques for streaming."""
    window: int
    mode: Literal["max", "min"]
    dq: Deque[Tuple[int, float]] = field(default_factory=deque)
    i: int = 0

    def push(self, value: float) -> float:
        i = self.i
        self.i += 1
        # drop out-of-window
        while self.dq and self.dq[0][0] <= i - self.window:
            self.dq.popleft()
        # maintain order
        if self.mode == "max":
            while self.dq and self.dq[-1][1] <= value:
                self.dq.pop()
        else:
            while self.dq and self.dq[-1][1] >= value:
                self.dq.pop()
        self.dq.append((i, value))
        return self.dq[0][1]


@dataclass
class IchimokuState:
    """Streaming Ichimoku (feed COMPLETED bars only). Backtest-safe (no forward shift here)."""
    tenkan: int = 9
    kijun: int = 26
    senkou_b: int = 52
    source: Source = "hl2"

    # windows over chosen source midpoints
    max_t: _MonotonicWindow = field(init=False)
    min_t: _MonotonicWindow = field(init=False)
    max_k: _MonotonicWindow = field(init=False)
    min_k: _MonotonicWindow = field(init=False)
    max_sb: _MonotonicWindow = field(init=False)
    min_sb: _MonotonicWindow = field(init=False)

    # last HA open for HA source
    _ha_o: Optional[float] = None

    def __post_init__(self):
        self.max_t = _MonotonicWindow(self.tenkan, "max")
        self.min_t = _MonotonicWindow(self.tenkan, "min")
        self.max_k = _MonotonicWindow(self.kijun, "max")
        self.min_k = _MonotonicWindow(self.kijun, "min")
        self.max_sb = _MonotonicWindow(self.senkou_b, "max")
        self.min_sb = _MonotonicWindow(self.senkou_b, "min")

    def _src_mid(self, h: float, l: float, c: float, o: Optional[float]) -> Tuple[float, float, float]:
        if self.source == "close":
            return h, l, c
        if self.source == "hl2":
            m = (h + l) / 2.0
            return m, m, m
        if self.source == "ohlc4":
            if o is None:
                m = (h + l + 2 * c) / 4.0
            else:
                m = (o + h + l + c) / 4.0
            return m, m, m
        if self.source == "ha":
            if o is None:
                raise ValueError("source='ha' requires open.")
            ha_c = (o + h + l + c) / 4.0
            ha_o = (self._ha_o + ha_c) / 2.0 if self._ha_o is not None else (o + c) / 2.0
            self._ha_o = ha_o
            ha_h = max(h, ha_o, ha_c)
            ha_l = min(l, ha_o, ha_c)
            m = (ha_h + ha_l) / 2.0
            return m, m, m
        raise ValueError("invalid source")

    def update(self, high: float, low: float, close: float, open_: Optional[float] = None) -> Dict[str, float]:
        if not (math.isfinite(high) and math.isfinite(low) and math.isfinite(close)):
            raise ValueError("Non-finite input.")
        if low > high:
            raise ValueError("low > high")
        mh, ml, mc = self._src_mid(high, low, close, open_)
        # when using non-close mid sources, we maintain a single mid value
        # use mh/ml for max/min windows
        mx_t = self.max_t.push(mh)
        mn_t = self.min_t.push(ml)
        tenkan = (mx_t + mn_t) / 2.0

        mx_k = self.max_k.push(mh)
        mn_k = self.min_k.push(ml)
        kijun = (mx_k + mn_k) / 2.0

        mx_sb = self.max_sb.push(mh)
        mn_sb = self.min_sb.push(ml)
        senkou_b = (mx_sb + mn_sb) / 2.0

        senkou_a = (tenkan + kijun) / 2.0
        chikou = close  # no backward shift in streaming

        return {"tenkan": tenkan, "kijun": kijun, "senkou_a": senkou_a, "senkou_b": senkou_b, "chikou": chikou}


# ───────────────────────────────────────────────────────────────────────────────
# MTF (Higher Timeframe) alignment (pandas only)
# ───────────────────────────────────────────────────────────────────────────────

def ichimoku_htf_aligned_pandas(
    df_ltf: "pd.DataFrame",
    *,
    htf_rule: str = "4H",
    tenkan: int = 9,
    kijun: int = 26,
    senkou_b: int = 52,
    disp: int = 26,
    source: Source = "hl2",
    join: Literal["ffill", "nearest"] = "ffill",
    output_shifted: bool = False,
) -> "pd.DataFrame":
    """
    Compute Ichimoku on HTF bars, then align back to LTF index.
    Requires pandas DataFrame with tz-aware DatetimeIndex and columns high/low/close (open optional).
    """
    if pd is None or not isinstance(df_ltf, pd.DataFrame):
        raise TypeError("ichimoku_htf_aligned_pandas requires pandas DataFrame input.")
    cols = {c.lower(): c for c in df_ltf.columns}
    for k in ("high", "low", "close"):
        if k not in cols:
            raise ValueError("df_ltf must have columns high/low/close.")
    # resample HTF
    agg = {
        cols["high"]: "max",
        cols["low"]: "min",
        cols["close"]: "last",
    }
    if "open" in cols:
        agg[cols["open"]] = "first"
    htf = df_ltf.resample(htf_rule).agg(agg).dropna(how="any")
    out = compute_ichimoku(
        htf, tenkan=tenkan, kijun=kijun, senkou_b=senkou_b, disp=disp,
        source=source, output_shifted=output_shifted, include_extras=False
    )
    df_htf = pd.DataFrame({
        "tenkan": out["tenkan"],
        "kijun": out["kijun"],
        "senkou_a": out["senkou_a"],
        "senkou_b": out["senkou_b"],
        "chikou": out["chikou"],
    }, index=htf.index)  # type: ignore

    if join == "ffill":
        return df_htf.reindex(df_ltf.index, method="ffill")
    if join == "nearest":
        return df_htf.reindex(df_ltf.index, method="nearest")
    raise ValueError("join must be 'ffill' or 'nearest'")


# ───────────────────────────────────────────────────────────────────────────────
# Plotting helpers (non-mutating)
# ───────────────────────────────────────────────────────────────────────────────

def for_plotting(
    tenkan: np.ndarray, kijun: np.ndarray, senkou_a: np.ndarray, senkou_b: np.ndarray,
    chikou: np.ndarray, *, disp: int
) -> Dict[str, np.ndarray]:
    """
    Produce plotting-aligned copies (forward/back shifts) without changing originals.
    Useful when you computed backtest-safe (unshifted) arrays.
    """
    n = len(tenkan)
    sa = np.concatenate([np.full(disp, np.nan), senkou_a])[:n]
    sb = np.concatenate([np.full(disp, np.nan), senkou_b])[:n]
    ch = np.concatenate([chikou[disp:], np.full(disp, np.nan)])
    return {"tenkan": tenkan.copy(), "kijun": kijun.copy(), "senkou_a": sa, "senkou_b": sb, "chikou": ch}


# ───────────────────────────────────────────────────────────────────────────────
# Minimal smoke test
# ───────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    rng = np.random.default_rng(7)
    n = 600
    px = np.cumsum(rng.normal(0, 1, n)) + 100
    high = px + rng.uniform(0.1, 1.0, n)
    low = px - rng.uniform(0.1, 1.0, n)
    close = px + rng.normal(0, 0.2, n)
    arr = np.column_stack([high, low, close])

    out = compute_ichimoku(arr, tenkan=9, kijun=26, senkou_b=52, disp=26,
                           source="hl2", output_shifted=False, include_extras=True, nan_policy="fill")
    assert all(k in out for k in ("tenkan","kijun","senkou_a","senkou_b","chikou","cloud_top","cloud_bot"))

    # Streaming parity (rough)
    st = IchimokuState()
    stream_vals: List[float] = []
    for h, l, c in arr:
        v = st.update(h, l, c)
        stream_vals.append(v["kijun"])
    print(
        {
            "kijun_stream_last": float(stream_vals[-1]),
            "kijun_batch_last": float(out["kijun"][-1]),  # type: ignore
        }
    )
