# stochastic_rsi.py
# Pro-grade Stochastic RSI:
# - True Wilder RSI (seeded SMA then recursive RMA) + alt smoothers (EMA/SMA/WMA/HMA/KAMA-lite)
# - Fast/Slow/Full StochRSI with configurable K/D smoothing + scaling (0–1 or 0–100)
# - Robust validation, NaN policy, min_periods, divide-by-zero handling strategy
# - Multiple price sources (close/hl2/ohlc4/Heikin-Ashi)
# - Streaming (O(1)) with rolling min/max via deques + RSI state
# - Signals: band crosses, KxD crosses, squeeze, Fisher transform, divergence (price vs StochRSI)
# - Multi-backend (numpy/pandas/polars) + optional HTF alignment (pandas)
# - Meta-rich outputs; dtype control; optional Numba/WASM-ready math (pure-numpy here)
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
ScaleMode = Literal["0_1", "0_100"]
RSIMethod = Literal["wilder", "ema", "sma"]
AvgMethod = Literal["sma", "ema", "wma", "hma", "kama"]  # for K/D smoothing
PriceSource = Literal["close", "hl2", "ohlc4", "ha"]
JoinMethod = Literal["ffill", "nearest"]
ZeroDivPolicy = Literal["nan", "zero", "prev"]  # when max==min in stoch window


# ───────────────────────────────────────────────────────────────────────────────
# Backend adapters & validation
# ───────────────────────────────────────────────────────────────────────────────

def _as_numpy(x: ArrayLike) -> Tuple[np.ndarray, Optional[np.ndarray], Dict[str, Any]]:
    """
    Accept:
      - pandas/polars DataFrame with columns: high, low, close (open optional for HA)
      - numpy (n,3|4) as [high, low, close(,open)]
    Return: (ndarray, timestamps(if any), meta{backend, has_open})
    """
    meta: Dict[str, Any] = {"backend": "numpy", "has_open": False}
    ts = None

    if pd is not None and isinstance(x, pd.DataFrame):
        cols = {c.lower(): c for c in x.columns}
        for k in ("high", "low", "close"):
            if k not in cols:
                raise ValueError(f"missing column '{k}'")
        has_open = "open" in cols
        h = x[cols["high"]].to_numpy(float)
        l = x[cols["low"]].to_numpy(float)
        c = x[cols["close"]].to_numpy(float)
        if has_open:
            o = x[cols["open"]].to_numpy(float)
            arr = np.column_stack([h, l, c, o])
        else:
            arr = np.column_stack([h, l, c])
        meta["backend"] = "pandas"
        meta["has_open"] = has_open
        ts = x.index.values if x.index is not None else None
        return arr, ts, meta

    if pl is not None and isinstance(x, pl.DataFrame):
        cols = {c.lower(): c for c in x.columns}
        for k in ("high", "low", "close"):
            if k not in cols:
                raise ValueError(f"missing column '{k}'")
        has_open = "open" in cols
        h = x[cols["high"]].to_numpy()
        l = x[cols["low"]].to_numpy()
        c = x[cols["close"]].to_numpy()
        if has_open:
            o = x[cols["open"]].to_numpy()
            arr = np.column_stack([h, l, c, o]).astype(float)
        else:
            arr = np.column_stack([h, l, c]).astype(float)
        meta["backend"] = "polars"
        meta["has_open"] = has_open
        return arr, None, meta

    if isinstance(x, np.ndarray):
        arr = np.asarray(x, float)
        if arr.ndim != 2 or arr.shape[1] not in (3, 4):
            raise ValueError("numpy input must be (n,3|4): [high,low,close(,open)]")
        meta["has_open"] = (arr.shape[1] == 4)
        return arr, None, meta

    raise TypeError("Unsupported input type.")


def _validate_prices(arr: np.ndarray):
    if arr.size == 0:
        raise ValueError("Empty input.")
    h, l, c = arr[:, 0], arr[:, 1], arr[:, 2]
    if np.any(~np.isfinite(h)) or np.any(~np.isfinite(l)) or np.any(~np.isfinite(c)):
        raise ValueError("Inputs contain non-finite values.")
    if np.any(l > h):
        raise ValueError("Found low > high.")


# ───────────────────────────────────────────────────────────────────────────────
# Price sources & helpers
# ───────────────────────────────────────────────────────────────────────────────

def _heikin_ashi(h, l, c, o):
    ha_c = (o + h + l + c) / 4.0
    ha_o = np.empty_like(ha_c)
    ha_o[0] = (o[0] + c[0]) / 2.0
    for i in range(1, len(ha_o)):
        ha_o[i] = (ha_o[i - 1] + ha_c[i - 1]) / 2.0
    ha_h = np.maximum.reduce([h, ha_o, ha_c])
    ha_l = np.minimum.reduce([l, ha_o, ha_c])
    return ha_h, ha_l, ha_c, ha_o

def _pick_source(arr: np.ndarray, has_open: bool, source: PriceSource, dtype: str) -> np.ndarray:
    h, l, c = arr[:, 0], arr[:, 1], arr[:, 2]
    if source == "close":
        return c.astype(dtype)
    if source == "hl2":
        return ((h + l) / 2.0).astype(dtype)
    if source == "ohlc4":
        if has_open:
            o = arr[:, 3]
            return ((o + h + l + c) / 4.0).astype(dtype)
        return ((h + l + 2 * c) / 4.0).astype(dtype)
    if source == "ha":
        if not has_open:
            raise ValueError("source='ha' requires 'open'.")
        o = arr[:, 3]
        ha_h, ha_l, ha_c, _ = _heikin_ashi(h, l, c, o)
        return ((ha_h + ha_l) / 2.0).astype(dtype)
    raise ValueError("invalid source")

def _clip_01(x: np.ndarray) -> np.ndarray:
    return np.minimum(1.0, np.maximum(0.0, x))


# ───────────────────────────────────────────────────────────────────────────────
# Rolling utils (deque-based) for O(n)
# ───────────────────────────────────────────────────────────────────────────────

def _roll_max(a: np.ndarray, win: int) -> np.ndarray:
    n = a.size
    out = np.full(n, np.nan)
    dq: Deque[int] = deque()
    for i in range(n):
        while dq and dq[0] <= i - win:
            dq.popleft()
        while dq and a[dq[-1]] <= a[i]:
            dq.pop()
        dq.append(i)
        if i >= win - 1:
            out[i] = a[dq[0]]
    return out

def _roll_min(a: np.ndarray, win: int) -> np.ndarray:
    n = a.size
    out = np.full(n, np.nan)
    dq: Deque[int] = deque()
    for i in range(n):
        while dq and dq[0] <= i - win:
            dq.popleft()
        while dq and a[dq[-1]] >= a[i]:
            dq.pop()
        dq.append(i)
        if i >= win - 1:
            out[i] = a[dq[0]]
    return out


# ───────────────────────────────────────────────────────────────────────────────
# Averages & Smoothers
# ───────────────────────────────────────────────────────────────────────────────

def _sma(x: np.ndarray, p: int) -> np.ndarray:
    n = x.size
    out = np.full(n, np.nan)
    if p <= 1 or n < p:
        if p <= 1:
            return x.copy()
        return out
    csum = np.cumsum(np.insert(x, 0, 0.0))
    out[p - 1:] = (csum[p:] - csum[:-p]) / p
    return out

def _ema(x: np.ndarray, p: int) -> np.ndarray:
    n = x.size
    out = np.full(n, np.nan)
    if p <= 1 or n < p:
        if p <= 1:
            return x.copy()
        return out
    seed = np.nanmean(x[:p])
    out[p - 1] = seed
    a = 2.0 / (p + 1.0)
    for i in range(p, n):
        out[i] = (1 - a) * out[i - 1] + a * x[i]
    return out

def _wma(x: np.ndarray, p: int) -> np.ndarray:
    n = x.size
    out = np.full(n, np.nan)
    if p <= 1 or n < p:
        if p <= 1:
            return x.copy()
        return out
    w = np.arange(1, p + 1, dtype=float)
    ws = np.sum(w)
    for i in range(p - 1, n):
        seg = x[i - p + 1 : i + 1]
        out[i] = np.dot(seg, w) / ws
    return out

def _hma(x: np.ndarray, p: int) -> np.ndarray:
    if p <= 1:
        return x.copy()
    p2 = max(1, p // 2)
    w1 = _wma(x, p2)
    w2 = _wma(x, p)
    diff = 2 * w1 - w2
    return _wma(diff, int(round(math.sqrt(p))))

def _kama(x: np.ndarray, p: int, fast: int = 2, slow: int = 30) -> np.ndarray:
    # Simplified KAMA; robust enough for KD smoothing
    n = x.size
    out = np.full(n, np.nan)
    if p <= 1 or n < p + 1:
        if p <= 1:
            return x.copy()
        return out
    change = np.abs(x - np.concatenate(([x[0]], x[:-1])))
    er_num = np.abs(x - np.concatenate(([x[0]], x[:-p])))
    er_den = np.convolve(change, np.ones(p, dtype=float), "full")[:n]
    er_den[: p - 1] = np.nan
    er = np.divide(er_num, er_den, out=np.full(n, np.nan), where=(er_den != 0))
    sc_fast = 2.0 / (fast + 1.0)
    sc_slow = 2.0 / (slow + 1.0)
    sc = (er * (sc_fast - sc_slow) + sc_slow) ** 2
    out[p] = np.nanmean(x[: p + 1])
    for i in range(p + 1, n):
        out[i] = out[i - 1] + sc[i] * (x[i] - out[i - 1])
    return out

def _avg(x: np.ndarray, p: int, method: AvgMethod) -> np.ndarray:
    if method == "sma":  return _sma(x, p)
    if method == "ema":  return _ema(x, p)
    if method == "wma":  return _wma(x, p)
    if method == "hma":  return _hma(x, p)
    if method == "kama": return _kama(x, p)
    raise ValueError("invalid avg method")


# ───────────────────────────────────────────────────────────────────────────────
# RSI (true Wilder, plus EMA/SMA)
# ───────────────────────────────────────────────────────────────────────────────

def _rsi_wilder(src: np.ndarray, p: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    n = src.size
    out = np.full(n, np.nan)
    gain = np.zeros(n)
    loss = np.zeros(n)
    ch = np.diff(src, prepend=src[0])
    gain[1:] = np.where(ch[1:] > 0, ch[1:], 0.0)
    loss[1:] = np.where(ch[1:] < 0, -ch[1:], 0.0)

    if n < p + 1:
        return out, gain, loss

    # seed with SMA
    ag = np.empty(n); al = np.empty(n)
    ag[:], al[:] = np.nan, np.nan
    ag[p] = np.nanmean(gain[1 : p + 1])
    al[p] = np.nanmean(loss[1 : p + 1])
    out[: p + 1] = np.nan

    a = (p - 1) / p
    for i in range(p + 1, n):
        ag[i] = a * ag[i - 1] + gain[i] / p
        al[i] = a * al[i - 1] + loss[i] / p
        rs = np.divide(ag[i], al[i]) if al[i] != 0 else np.inf
        out[i] = 100.0 - (100.0 / (1.0 + rs))
    return out, ag, al

def _rsi_ema(src: np.ndarray, p: int) -> np.ndarray:
    # EMA on gains/losses (non-Wilder): closer to some libraries
    n = src.size
    out = np.full(n, np.nan)
    ch = np.diff(src, prepend=src[0])
    g = np.where(ch > 0, ch, 0.0)
    l = np.where(ch < 0, -ch, 0.0)
    eg = _ema(g, p); el = _ema(l, p)
    for i in range(n):
        if np.isfinite(eg[i]) and np.isfinite(el[i]):
            rs = eg[i] / el[i] if el[i] != 0 else np.inf
            out[i] = 100.0 - (100.0 / (1.0 + rs))
    return out

def _rsi_sma(src: np.ndarray, p: int) -> np.ndarray:
    n = src.size
    out = np.full(n, np.nan)
    ch = np.diff(src, prepend=src[0])
    g = np.where(ch > 0, ch, 0.0)
    l = np.where(ch < 0, -ch, 0.0)
    sg = _sma(g, p); sl = _sma(l, p)
    for i in range(n):
        if np.isfinite(sg[i]) and np.isfinite(sl[i]):
            rs = sg[i] / sl[i] if sl[i] != 0 else np.inf
            out[i] = 100.0 - (100.0 / (1.0 + rs))
    return out


# ───────────────────────────────────────────────────────────────────────────────
# Public API (batch)
# ───────────────────────────────────────────────────────────────────────────────

def compute_stochrsi(
    data: ArrayLike,
    *,
    rsi_len: int = 14,
    stoch_len: int = 14,
    k_len: int = 3,
    d_len: int = 3,
    rsi_method: RSIMethod = "wilder",
    k_method: AvgMethod = "sma",
    d_method: AvgMethod = "sma",
    source: PriceSource = "close",
    scale: ScaleMode = "0_100",
    zero_div_policy: ZeroDivPolicy = "nan",
    fisher: bool = False,
    bands: Tuple[float, float] = (20.0, 80.0),   # used if scale=0_100; if 0_1 use (0.2,0.8)
    nan_policy: NanPolicy = "propagate",
    min_periods: Optional[int] = None,
    dtype: Literal["float32", "float64"] = "float64",
    return_components: bool = True,
) -> Dict[str, Union[np.ndarray, Dict[str, Any]]]:
    """
    Compute Stochastic RSI (Fast/Slow/Full by choosing k_len/d_len/methods).
    Returns:
      - 'k', 'd', optionally 'k_raw', 'rsi', 'stoch_base', 'fisher', 'signals', 'meta'
    """
    arr, ts, meta = _as_numpy(data)
    _validate_prices(arr)
    min_periods = int(min_periods or max(rsi_len + 1, stoch_len))

    price = _pick_source(arr, meta["has_open"], source, dtype)
    # RSI
    if rsi_method == "wilder":
        rsi, avg_g, avg_l = _rsi_wilder(price, rsi_len)
    elif rsi_method == "ema":
        rsi = _rsi_ema(price, rsi_len); avg_g = avg_l = np.array([])
    else:
        rsi = _rsi_sma(price, rsi_len); avg_g = avg_l = np.array([])

    # Stochastic of RSI
    # Rolling min/max over RSI
    rsi_min = _roll_min(rsi, stoch_len)
    rsi_max = _roll_max(rsi, stoch_len)
    with np.errstate(invalid="ignore"):
        rng = rsi_max - rsi_min
    base = np.divide(rsi - rsi_min, rng, out=np.full_like(rsi, np.nan), where=(rng != 0))
    # Divide-by-zero policy
    if zero_div_policy != "nan":
        mask = ~np.isfinite(base)
        if zero_div_policy == "zero":
            base[mask] = 0.0
        elif zero_div_policy == "prev":
            # forward fill
            idx = np.where(np.isfinite(base), np.arange(base.size), -1)
            np.maximum.accumulate(idx, out=idx)
            base = np.where(idx >= 0, base[idx], np.nan)

    base = _clip_01(base)  # keep in [0,1]

    # Fast %K = base; Slow/Full: smooth
    k_raw = base.copy()
    k = _avg(base, k_len, k_method)
    d = _avg(k, d_len, d_method)

    # scale
    if scale == "0_100":
        k_scaled = k * 100.0
        d_scaled = d * 100.0
        k_raw_scaled = k_raw * 100.0
        low_b, high_b = bands
    else:
        k_scaled = k
        d_scaled = d
        k_raw_scaled = k_raw
        low_b, high_b = (bands[0], bands[1]) if bands[0] <= 1.0 else (bands[0] / 100.0, bands[1] / 100.0)

    out: Dict[str, Union[np.ndarray, Dict[str, Any]]] = {
        "k": k_scaled,
        "d": d_scaled,
        "meta": {
            "rsi_len": rsi_len,
            "stoch_len": stoch_len,
            "k_len": k_len,
            "d_len": d_len,
            "rsi_method": rsi_method,
            "k_method": k_method,
            "d_method": d_method,
            "source": source,
            "scale": scale,
            "zero_div_policy": zero_div_policy,
            "dtype": dtype,
            "nan_policy": nan_policy,
            "backend": meta["backend"],
            "min_periods": min_periods,
        },
    }
    if return_components:
        out["k_raw"] = k_raw_scaled
        out["rsi"] = rsi
        out["stoch_base"] = base
        if rsi_method == "wilder":
            out["rsi_avg_gain"] = avg_g
            out["rsi_avg_loss"] = avg_l

    # Fisher transform (on k in 0..1 scaled to -0.999..0.999 first)
    if fisher:
        z = np.clip(2.0 * base - 1.0, -0.999, 0.999)
        fisher_k = 0.5 * np.log((1 + z) / (1 - z))
        out["fisher"] = fisher_k

    # Signals
    signals = _signals(k_scaled, d_scaled, price, low_b, high_b)
    out["signals"] = signals

    # NaN policy
    if nan_policy != "propagate":
        arrays = {k: v for k, v in out.items() if isinstance(v, np.ndarray)}
        anchor = arrays["k"]
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
                if not mask.any(): return a
                idx = np.where(mask, np.arange(a.size), 0)
                np.maximum.accumulate(idx, out=idx)
                return a[idx]
            for k in list(arrays.keys()):
                arrays[k] = ffill(arrays[k])
        for k, v in arrays.items():
            out[k] = v  # type: ignore

    return out


def _signals(k: np.ndarray, d: np.ndarray, price: np.ndarray, low_b: float, high_b: float) -> Dict[str, np.ndarray]:
    n = k.size
    bull_cross = np.zeros(n, dtype=bool)
    bear_cross = np.zeros(n, dtype=bool)
    enter_ob = np.zeros(n, dtype=bool)  # into overbought
    exit_ob = np.zeros(n, dtype=bool)
    enter_os = np.zeros(n, dtype=bool)  # into oversold
    exit_os = np.zeros(n, dtype=bool)
    squeeze = np.zeros(n, dtype=bool)

    # K x D crosses
    dk_prev = k[:-1] - d[:-1]
    dk_curr = k[1:] - d[1:]
    bull_cross[1:] = (dk_prev <= 0) & (dk_curr > 0)
    bear_cross[1:] = (dk_prev >= 0) & (dk_curr < 0)

    # Bands logic
    enter_ob[1:] = (k[1:] >= high_b) & (k[:-1] < high_b)
    exit_ob[1:]  = (k[1:] < high_b) & (k[:-1] >= high_b)
    enter_os[1:] = (k[1:] <= low_b)  & (k[:-1] > low_b)
    exit_os[1:]  = (k[1:] > low_b)  & (k[:-1] <= low_b)

    # Squeeze: prolonged inside [low_b, high_b]
    window = 10
    if n >= window:
        inside = (k >= low_b) & (k <= high_b)
        squeeze[window - 1:] = np.convolve(inside.astype(int), np.ones(window, dtype=int), "valid") == window

    # Simple divergence flags (optional quick heuristic)
    div = stochrsi_divergences(price, k, lookback=20, min_sep=3)

    return {
        "bull_cross": bull_cross,
        "bear_cross": bear_cross,
        "enter_overbought": enter_ob,
        "exit_overbought": exit_ob,
        "enter_oversold": enter_os,
        "exit_oversold": exit_os,
        "squeeze": squeeze,
        "bull_div": div["bull_div"],
        "bear_div": div["bear_div"],
    }


def stochrsi_divergences(price: np.ndarray, k: np.ndarray, *, lookback: int = 20, min_sep: int = 3) -> Dict[str, np.ndarray]:
    n = price.size
    bull = np.zeros(n, dtype=bool)
    bear = np.zeros(n, dtype=bool)
    if n < lookback + 2:
        return {"bull_div": bull, "bear_div": bear}

    def lmin(a):
        m = np.zeros(n, dtype=bool)
        for i in range(1, n - 1):
            if a[i] <= a[i - 1] and a[i] <= a[i + 1]:
                m[i] = True
        return m

    def lmax(a):
        m = np.zeros(n, dtype=bool)
        for i in range(1, n - 1):
            if a[i] >= a[i - 1] and a[i] >= a[i + 1]:
                m[i] = True
        return m

    pmin, pmax = lmin(price), lmax(price)
    omin, omax = lmin(k), lmax(k)

    for i in range(lookback, n):
        ip = np.where(pmin[i - lookback:i])[0]
        ik = np.where(omin[i - lookback:i])[0]
        if ip.size >= 2 and ik.size >= 2:
            a, b = ip[-2] + (i - lookback), ip[-1] + (i - lookback)
            aa, bb = ik[-2] + (i - lookback), ik[-1] + (i - lookback)
            if b - a >= min_sep and bb - aa >= min_sep:
                if price[b] < price[a] and k[bb] > k[aa]:
                    bull[i] = True

        ip = np.where(pmax[i - lookback:i])[0]
        ik = np.where(omax[i - lookback:i])[0]
        if ip.size >= 2 and ik.size >= 2:
            a, b = ip[-2] + (i - lookback), ip[-1] + (i - lookback)
            aa, bb = ik[-2] + (i - lookback), ik[-1] + (i - lookback)
            if b - a >= min_sep and bb - aa >= min_sep:
                if price[b] > price[a] and k[bb] < k[aa]:
                    bear[i] = True

    return {"bull_div": bull, "bear_div": bear}


# ───────────────────────────────────────────────────────────────────────────────
# Streaming / Incremental (O(1) per bar) — backtest-safe (no forward lookahead)
# ───────────────────────────────────────────────────────────────────────────────

@dataclass
class _MonoWindow:
    win: int
    mode: Literal["max", "min"]
    dq: Deque[Tuple[int, float]] = field(default_factory=deque)
    i: int = 0
    def push(self, v: float) -> float:
        i = self.i; self.i += 1
        while self.dq and self.dq[0][0] <= i - self.win:
            self.dq.popleft()
        if self.mode == "max":
            while self.dq and self.dq[-1][1] <= v: self.dq.pop()
        else:
            while self.dq and self.dq[-1][1] >= v: self.dq.pop()
        self.dq.append((i, v))
        return self.dq[0][1]

@dataclass
class RSIState:
    length: int = 14
    method: RSIMethod = "wilder"
    # Wilder state
    ag: float = math.nan
    al: float = math.nan
    seeded: bool = False
    count: int = 0
    seed_g: float = 0.0
    seed_l: float = 0.0
    prev: float = math.nan
    def update(self, price: float) -> float:
        if not math.isfinite(self.prev):
            self.prev = price
            return math.nan
        ch = price - self.prev
        g = ch if ch > 0 else 0.0
        l = -ch if ch < 0 else 0.0
        self.count += 1
        if not self.seeded:
            self.seed_g += g; self.seed_l += l
            if self.count >= self.length:
                self.ag = self.seed_g / self.length
                self.al = self.seed_l / self.length
                self.seeded = True
                rs = self.ag / self.al if self.al != 0 else math.inf
                self.prev = price
                return 100.0 - 100.0 / (1.0 + rs)
            self.prev = price
            return math.nan
        if self.method == "wilder":
            a = (self.length - 1) / self.length
            self.ag = a * self.ag + g / self.length
            self.al = a * self.al + l / self.length
        elif self.method == "ema":
            a = 2.0 / (self.length + 1.0)
            self.ag = (1 - a) * (self.ag if math.isfinite(self.ag) else g) + a * g
            self.al = (1 - a) * (self.al if math.isfinite(self.al) else l) + a * l
        else:  # sma (streaming approximation not exact)
            a = (self.length - 1) / self.length
            self.ag = a * (self.ag if math.isfinite(self.ag) else g) + g / self.length
            self.al = a * (self.al if math.isfinite(self.al) else l) + l / self.length
        rs = self.ag / self.al if self.al != 0 else math.inf
        self.prev = price
        return 100.0 - 100.0 / (1.0 + rs)

@dataclass
class StochRSIState:
    rsi_len: int = 14
    stoch_len: int = 14
    k_len: int = 3
    d_len: int = 3
    rsi_method: RSIMethod = "wilder"
    k_method: AvgMethod = "sma"
    d_method: AvgMethod = "sma"
    scale: ScaleMode = "0_100"
    zero_div_policy: ZeroDivPolicy = "nan"
    # internals
    rsi_state: RSIState = field(init=False)
    maxw: _MonoWindow = field(init=False)
    minw: _MonoWindow = field(init=False)
    k_buf: List[float] = field(default_factory=list)
    d_buf: List[float] = field(default_factory=list)
    last_open: Optional[float] = None  # for HA if you implement stream source mapping externally

    def __post_init__(self):
        self.rsi_state = RSIState(self.rsi_len, self.rsi_method)
        self.maxw = _MonoWindow(self.stoch_len, "max")
        self.minw = _MonoWindow(self.stoch_len, "min")

    def _avg_stream(self, buf: List[float], val: float, p: int, method: AvgMethod) -> float:
        buf.append(val)
        if len(buf) > 512:  # prevent unbounded
            buf[:] = buf[-(p * 4) :]
        arr = np.asarray(buf, float)
        if method == "sma":
            if len(arr) < p: return np.nan
            return np.nanmean(arr[-p:])
        if method == "ema":
            if len(arr) < p: return np.nan
            out = _ema(arr, p)
            return out[-1]
        if method == "wma":
            if len(arr) < p: return np.nan
            out = _wma(arr, p); return out[-1]
        if method == "hma":
            if len(arr) < p: return np.nan
            out = _hma(arr, p); return out[-1]
        if method == "kama":
            if len(arr) < p + 1: return np.nan
            out = _kama(arr, p); return out[-1]
        raise ValueError("invalid method")

    def update(self, price: float) -> Dict[str, float]:
        r = self.rsi_state.update(price)
        if not math.isfinite(r):
            return {"k": math.nan, "d": math.nan}
        rsi_val = r
        mx = self.maxw.push(rsi_val)
        mn = self.minw.push(rsi_val)
        rng = mx - mn
        if rng == 0 or not math.isfinite(rng):
            if self.zero_div_policy == "nan":
                base = math.nan
            elif self.zero_div_policy == "zero":
                base = 0.0
            else:  # prev
                base = self.k_buf[-1] if self.k_buf else math.nan
        else:
            base = (rsi_val - mn) / rng
            base = min(1.0, max(0.0, base))

        k_val = self._avg_stream(self.k_buf, base, self.k_len, self.k_method)
        d_val = self._avg_stream(self.d_buf, k_val, self.d_len, self.d_method)
        if self.scale == "0_100":
            k_val = k_val * 100.0 if math.isfinite(k_val) else k_val
            d_val = d_val * 100.0 if math.isfinite(d_val) else d_val
        return {"k": k_val, "d": d_val}


# ───────────────────────────────────────────────────────────────────────────────
# HTF alignment (pandas only)
# ───────────────────────────────────────────────────────────────────────────────

def stochrsi_htf_aligned_pandas(
    df_ltf: "pd.DataFrame",
    *,
    htf_rule: str = "4H",
    rsi_len: int = 14,
    stoch_len: int = 14,
    k_len: int = 3,
    d_len: int = 3,
    rsi_method: RSIMethod = "wilder",
    k_method: AvgMethod = "sma",
    d_method: AvgMethod = "sma",
    source: PriceSource = "close",
    scale: ScaleMode = "0_100",
    zero_div_policy: ZeroDivPolicy = "nan",
    join: JoinMethod = "ffill",
) -> "pd.DataFrame":
    if pd is None or not isinstance(df_ltf, pd.DataFrame):
        raise TypeError("stochrsi_htf_aligned_pandas requires pandas DataFrame.")
    cols = {c.lower(): c for c in df_ltf.columns}
    for k in ("high", "low", "close"):
        if k not in cols: raise ValueError("df_ltf must have high/low/close.")
    agg = {cols["high"]: "max", cols["low"]: "min", cols["close"]: "last"}
    if "open" in cols: agg[cols["open"]] = "first"
    htf = df_ltf.resample(htf_rule).agg(agg).dropna(how="any")

    out = compute_stochrsi(
        htf,
        rsi_len=rsi_len, stoch_len=stoch_len, k_len=k_len, d_len=d_len,
        rsi_method=rsi_method, k_method=k_method, d_method=d_method,
        source=source, scale=scale, zero_div_policy=zero_div_policy,
        nan_policy="fill", return_components=False,
    )
    df = pd.DataFrame({"k": out["k"], "d": out["d"]}, index=htf.index)  # type: ignore
    if join == "ffill":
        return df.reindex(df_ltf.index, method="ffill")
    if join == "nearest":
        return df.reindex(df_ltf.index, method="nearest")
    raise ValueError("join must be 'ffill' or 'nearest'")


# ───────────────────────────────────────────────────────────────────────────────
# Minimal smoke test
# ───────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    rng = np.random.default_rng(7)
    n = 800
    px = np.cumsum(rng.normal(0, 1, n)) + 100
    hi = px + rng.uniform(0.1, 1.0, n)
    lo = px - rng.uniform(0.1, 1.0, n)
    cl = px + rng.normal(0, 0.2, n)
    arr = np.column_stack([hi, lo, cl])

    res = compute_stochrsi(
        arr,
        rsi_len=14, stoch_len=14, k_len=3, d_len=3,
        rsi_method="wilder", k_method="ema", d_method="ema",
        source="close", scale="0_100", fisher=True,
        nan_policy="fill", zero_div_policy="prev",
    )
    st = StochRSIState(rsi_len=14, stoch_len=14, k_len=3, d_len=3, rsi_method="wilder", k_method="ema", d_method="ema")
    last = {}
    for h, l, c in arr:
        last = st.update(c)
    print({
        "k_last_batch": float(res["k"][-1]),  # type: ignore
        "k_last_stream": float(last["k"]),
        "signals_keys": list(res["signals"].keys()),  # type: ignore
    })
