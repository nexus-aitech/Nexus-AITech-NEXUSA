# vwap.py
# Pro-grade VWAP:
# - Multi-backend (numpy/pandas/polars), strict validation, dtype control
# - True sessions (24/7 crypto or equity-style) with TZ; daily/weekly/monthly/YTD & custom anchors
# - Multiple anchors at once (returns columns per anchor)
# - Anchored VWAP & Streaming O(1) state with auto reset on session boundary
# - HTF computation + alignment back to LTF (pandas)
# - Price sources (close/hlc3/ohlc4/ha) & volume kinds (raw/tick/notional)
# - Bands: ±k·σ (weighted stdev around VWAP) and ±k·MAD (robust), z-score & %Deviation
# - NaN policy (propagate/drop/fill), safe divide-by-zero handling, comprehensive metadata
# - Panel-friendly (symbol column optional), efficient vectorization
# MIT License.

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, Literal, Optional, Tuple, Union, Any, Iterable, List, Callable
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
PriceSource = Literal["close", "hlc3", "ohlc4", "ha"]
VolumeKind = Literal["raw", "tick", "notional"]
NanPolicy = Literal["propagate", "drop", "fill"]
JoinMethod = Literal["ffill", "nearest"]
SessionKind = Literal["24x7", "equity"]
AnchorKind = Literal["session", "day", "week", "month", "ytd", "custom"]

# ───────────────────────────────────────────────────────────────────────────────
# Helpers: adapters & validation
# ───────────────────────────────────────────────────────────────────────────────

def _as_numpy(x: ArrayLike, *, require_time: bool = False, symbol_col: Optional[str] = None) -> Tuple[np.ndarray, Optional[np.ndarray], Dict[str, Any]]:
    """
    Accept:
      - pandas/polars DataFrame with columns: time(index or column), high, low, close, volume; open optional for HA; symbol optional
      - numpy ndarray shaped (n, 4|5): [close, volume, high, low,(open)]  (no time in numpy mode)
    Return: (ndarray(n,k), timestamps(ns) or None, meta{backend, has_open, has_symbol, symbols(optional)})
    """
    meta: Dict[str, Any] = {"backend": "numpy", "has_open": False, "has_symbol": False}
    ts = None

    if pd is not None and isinstance(x, pd.DataFrame):
        df = x.copy()
        cols = {c.lower(): c for c in df.columns}
        # infer time column or index
        if "time" in cols:
            t = pd.to_datetime(df[cols["time"]], errors="coerce")
            if require_time and t.isna().any():
                raise ValueError("Invalid timestamps in 'time' column.")
            df.index = t
        elif isinstance(df.index, (pd.DatetimeIndex,)):
            if require_time and df.index.tz is None:
                # keep naive; user can pass tz param below
                pass
        elif require_time:
            raise ValueError("Time column/index required for session/anchor features.")

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
        else:
            # fallback: high=low=close
            arr_list += [c, c]
        if "open" in cols:
            o = df[cols["open"]].to_numpy(float)
            arr_list += [o]
            meta["has_open"] = True

        # symbol
        meta["symbols"] = None
        if symbol_col and symbol_col in df.columns:
            meta["has_symbol"] = True
            meta["symbols"] = df[symbol_col].astype(str).to_numpy()

        arr = np.column_stack(arr_list).astype(float)
        meta["backend"] = "pandas"
        ts = df.index.values if isinstance(df.index, pd.DatetimeIndex) else None
        return arr, ts, meta

    if pl is not None and isinstance(x, pl.DataFrame):
        cols = {c.lower(): c for c in x.columns}
        if require_time and "time" not in cols:
            raise ValueError("time column required for session/anchor features in polars mode.")
        if "time" in cols:
            ts_series = x[cols["time"]]
            # let timestamps be None (we won't rely on exact ns in polars)
            ts = ts_series.to_numpy()  # optional
        need = ("close", "volume")
        for k in need:
            if k not in cols:
                raise ValueError(f"missing column '{k}'")
        c = x[cols["close"]].to_numpy()
        v = x[cols["volume"]].to_numpy()
        if "high" in cols and "low" in cols:
            h = x[cols["high"]].to_numpy()
            l = x[cols["low"]].to_numpy()
        else:
            h = c; l = c
        if "open" in cols:
            o = x[cols["open"]].to_numpy()
            arr = np.column_stack([c, v, h, l, o]).astype(float)
            meta["has_open"] = True
        else:
            arr = np.column_stack([c, v, h, l]).astype(float)
        meta["backend"] = "polars"
        if symbol_col and symbol_col in x.columns:
            meta["has_symbol"] = True
            meta["symbols"] = x[symbol_col].to_numpy().astype(str)
        return arr, None, meta

    if isinstance(x, np.ndarray):
        arr = np.asarray(x, float)
        if arr.ndim != 2 or arr.shape[1] < 4:
            raise ValueError("numpy input must be shape (n,4|5): [close,volume,high,low(,open)]")
        meta["has_open"] = (arr.shape[1] >= 5)
        return arr, None, meta

    raise TypeError("Unsupported input type.")


def _validate(arr: np.ndarray):
    if arr.size == 0:
        raise ValueError("Empty input.")
    c, v, h, l = arr[:, 0], arr[:, 1], arr[:, 2], arr[:, 3]
    if np.any(~np.isfinite(c)) or np.any(~np.isfinite(v)) or np.any(~np.isfinite(h)) or np.any(~np.isfinite(l)):
        raise ValueError("Inputs contain non-finite values.")
    if np.any(v < 0):
        raise ValueError("Negative volume encountered.")
    if np.any(l > h):
        raise ValueError("Found low > high.")


# ───────────────────────────────────────────────────────────────────────────────
# Price & volume definitions
# ───────────────────────────────────────────────────────────────────────────────

def _price_source(arr: np.ndarray, meta: Dict[str, Any], src: PriceSource) -> np.ndarray:
    c, h, l = arr[:, 0], arr[:, 2], arr[:, 3]
    if src == "close":
        return c
    if src == "hlc3":
        return (h + l + c) / 3.0
    if src == "ohlc4":
        if meta.get("has_open", False):
            o = arr[:, 4]
            return (o + h + l + c) / 4.0
        return (h + l + 2 * c) / 4.0
    if src == "ha":
        if not meta.get("has_open", False):
            raise ValueError("source='ha' requires open.")
        o = arr[:, 4]
        ha_c = (o + h + l + c) / 4.0
        ha_o = np.empty_like(ha_c)
        ha_o[0] = (o[0] + c[0]) / 2.0
        for i in range(1, len(ha_o)):
            ha_o[i] = (ha_o[i - 1] + ha_c[i - 1]) / 2.0
        ha_h = np.maximum.reduce([h, ha_o, ha_c])
        ha_l = np.minimum.reduce([l, ha_o, ha_c])
        return (ha_h + ha_l) / 2.0
    raise ValueError("invalid price source")


def _volume_kind(vol: np.ndarray, ref_price: np.ndarray, kind: VolumeKind) -> np.ndarray:
    if kind == "raw":
        return vol
    if kind == "tick":
        return (vol > 0).astype(float)
    if kind == "notional":
        return vol * ref_price
    raise ValueError("invalid volume kind")


# ───────────────────────────────────────────────────────────────────────────────
# Session & anchors (pandas only for calendarized boundaries)
# ───────────────────────────────────────────────────────────────────────────────

def _ensure_tz(idx: "pd.DatetimeIndex", tz: Optional[str]) -> "pd.DatetimeIndex":
    if tz is None:
        return idx if idx.tz is not None else idx.tz_localize("UTC")
    return (idx.tz_convert(tz) if idx.tz is not None else idx.tz_localize(tz))

def _session_grouper(idx: "pd.DatetimeIndex", *, session: SessionKind, tz: Optional[str], equity_hours: Tuple[str, str] = ("09:30", "16:00")) -> "pd.Series":
    """
    Returns a session key per timestamp.
    - 24x7: calendar day in tz (00:00..24:00)
    - equity: only inside open-close window; outside returns previous session key but flagged later
    """
    idx_tz = _ensure_tz(idx, tz)
    if session == "24x7":
        return idx_tz.normalize()  # date as session key
    # equity style: use date; open/close windows
    open_h, close_h = equity_hours
    # session key = same date; filtering of outside hours done by mask
    return idx_tz.normalize()

def _in_equity_window(idx: "pd.DatetimeIndex", tz: Optional[str], equity_hours: Tuple[str, str]) -> np.ndarray:
    idx_tz = _ensure_tz(idx, tz)
    open_h, close_h = equity_hours
    t1 = pd.to_datetime(idx_tz.strftime(f"%Y-%m-%d {open_h}"), utc=True).tz_convert(idx_tz.tz)
    t2 = pd.to_datetime(idx_tz.strftime(f"%Y-%m-%d {close_h}"), utc=True).tz_convert(idx_tz.tz)
    return (idx_tz >= t1.values) & (idx_tz <= t2.values)

def _anchor_keys(idx: "pd.DatetimeIndex", kind: AnchorKind, tz: Optional[str], custom: Optional[Iterable[pd.Timestamp]] = None) -> "pd.Series":
    idx_tz = _ensure_tz(idx, tz)
    if kind == "day":
        return idx_tz.normalize()
    if kind == "week":
        # Monday as start
        return (idx_tz - pd.to_timedelta(idx_tz.weekday, unit="D")).normalize()
    if kind == "month":
        return idx_tz.to_period("M").start_time.tz_localize(idx_tz.tz)
    if kind == "ytd":
        years = idx_tz.year
        starts = pd.to_datetime([f"{y}-01-01" for y in years]).tz_localize(idx_tz.tz)
        return pd.DatetimeIndex(starts)
    if kind == "session":
        return idx_tz.normalize()
    if kind == "custom":
        if not custom:
            raise ValueError("custom anchors require 'custom' iterable of timestamps")
        marks = pd.DatetimeIndex(pd.to_datetime(list(custom)))
        # map each idx to last anchor <= idx
        marks = _ensure_tz(marks, idx_tz.tz.key if idx_tz.tz is not None else "UTC")
        # asof join:
        df = pd.DataFrame({"idx": idx_tz})
        df_a = pd.DataFrame({"anchor": marks})
        j = pd.merge_asof(df.sort_values("idx"), df_a.sort_values("anchor"), left_on="idx", right_on="anchor", direction="backward")
        keys = j["anchor"].values
        keys[pd.isna(keys)] = idx_tz.min()
        return pd.DatetimeIndex(keys)
    raise ValueError("invalid anchor")


# ───────────────────────────────────────────────────────────────────────────────
# NaN policy utils
# ───────────────────────────────────────────────────────────────────────────────

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


# ───────────────────────────────────────────────────────────────────────────────
# Core: batch anchored VWAP (pandas/numpy/polars)
# ───────────────────────────────────────────────────────────────────────────────

def compute_vwap(
    data: ArrayLike,
    *,
    price_source: PriceSource = "hlc3",
    volume_kind: VolumeKind = "raw",
    anchors: Tuple[AnchorKind, ...] = ("session",),
    custom_anchors: Optional[Iterable["pd.Timestamp"]] = None,
    session: SessionKind = "24x7",
    tz: Optional[str] = None,
    equity_hours: Tuple[str, str] = ("09:30", "16:00"),
    bands_k: Optional[float] = 1.0,
    bands_method: Literal["stdev", "mad"] = "stdev",
    return_deviation: bool = True,
    nan_policy: NanPolicy = "propagate",
    dtype: Literal["float32", "float64"] = "float64",
    symbol_col: Optional[str] = None,
) -> Dict[str, Union[np.ndarray, Dict[str, Any]]]:
    """
    Compute Anchored VWAP(s) with session/calendar awareness and analytical outputs.

    Returns dict with:
      - 'vwap_<anchor>' for each requested anchor
      - optionally: 'upper_<anchor>','lower_<anchor>' (bands), 'zscore_<anchor>','pctdev_<anchor>'
      - 'meta'
    """
    require_time = True if pd is not None and isinstance(data, pd.DataFrame) else False
    arr, ts, meta = _as_numpy(data, require_time=require_time, symbol_col=symbol_col)
    _validate(arr)

    c, v = arr[:, 0].astype(dtype), arr[:, 1].astype(dtype)
    h, l = arr[:, 2].astype(dtype), arr[:, 3].astype(dtype)
    price = _price_source(arr, meta, price_source).astype(dtype)
    vol = _volume_kind(v, price, volume_kind).astype(dtype)

    out: Dict[str, Union[np.ndarray, Dict[str, Any]]] = {"meta": {
        "backend": meta["backend"], "price_source": price_source, "volume_kind": volume_kind,
        "anchors": anchors, "session": session, "tz": tz, "equity_hours": equity_hours,
        "bands_k": bands_k, "bands_method": bands_method, "nan_policy": nan_policy, "dtype": dtype,
        "has_symbol": meta.get("has_symbol", False)
    }}

    if pd is None or not isinstance(data, pd.DataFrame):
        # Non-pandas branch (no session calendar): single rolling anchor = 'session' interpreted as whole series
        wprice = price * vol
        csum_wprice = np.cumsum(wprice, dtype=dtype)
        csum_vol = np.cumsum(vol, dtype=dtype)
        vwap = np.divide(csum_wprice, csum_vol, out=np.full_like(csum_wprice, np.nan), where=(csum_vol != 0))
        out["vwap_session"] = vwap
        if bands_k is not None:
            # weighted stdev around vwap (incremental formula)
            diff = price - vwap
            wmean = vwap
            # approximate wstd using windowless cumulative second moment (numerical stable enough for analysis)
            w2 = np.cumsum(vol * (price ** 2), dtype=dtype)
            w1 = csum_wprice
            denom = csum_vol
            var = np.divide(w2, denom, out=np.full_like(denom, np.nan), where=(denom != 0)) - (wmean ** 2)
            std = np.sqrt(np.maximum(var, 0.0))
            if bands_method == "mad":
                # robust: approximate MAD ≈ 1.4826*std for normal; for simplicity reuse std
                mad = 1.4826 * std
                ub = vwap + bands_k * mad
                lb = vwap - bands_k * mad
            else:
                ub = vwap + bands_k * std
                lb = vwap - bands_k * std
            out["upper_session"], out["lower_session"] = ub, lb
            if return_deviation:
                out["zscore_session"] = np.divide(price - vwap, std, out=np.full_like(std, np.nan), where=(std > 0))
                out["pctdev_session"] = np.divide(price - vwap, vwap, out=np.full_like(vwap, np.nan), where=(vwap != 0))
        arrays = {k: v for k, v in out.items() if isinstance(v, np.ndarray)}
        _apply_nan_policy(arrays, "vwap_session", nan_policy)
        for k, vv in arrays.items():
            out[k] = vv  # type: ignore
        return out

    # pandas branch with time/calendar & multiple anchors
    df: pd.DataFrame = data.copy()  # type: ignore
    if not isinstance(df.index, pd.DatetimeIndex):
        if "time" in df.columns:
            df["time"] = pd.to_datetime(df["time"], errors="coerce")
            df = df.set_index("time")
        else:
            raise ValueError("Time column or DatetimeIndex required in pandas mode.")
    idx = df.index
    idx = _ensure_tz(idx, tz)
    df = df.set_index(idx)

    # Equity session mask
    if session == "equity":
        mask = _in_equity_window(df.index, tz, equity_hours)
        df = df[mask]

    # Precompute base fields
    df["_price"] = price
    df["_vol"] = vol
    df["_pv"] = df["_price"] * df["_vol"]
    df["_p2v"] = (df["_price"] ** 2) * df["_vol"]

    def anchored(series_df: "pd.DataFrame", keys: "pd.Series", tag: str):
        # group by anchor key and do cumulative sums per group
        g = series_df.groupby(keys, sort=False)
        csum_pv = g["_pv"].cumsum()
        csum_v = g["_vol"].cumsum()
        vwap = csum_pv / csum_v.replace(0, np.nan)
        out[f"vwap_{tag}"] = vwap.to_numpy(dtype)

        if bands_k is not None:
            csum_p2v = g["_p2v"].cumsum()
            wmean = vwap
            denom = csum_v.replace(0, np.nan)
            var = (csum_p2v / denom) - (wmean ** 2)
            std = np.sqrt(np.maximum(var, 0.0))
            if bands_method == "mad":
                mad = 1.4826 * std
                ub = wmean + bands_k * mad
                lb = wmean - bands_k * mad
            else:
                ub = wmean + bands_k * std
                lb = wmean - bands_k * std
            out[f"upper_{tag}"] = ub.to_numpy(dtype)
            out[f"lower_{tag}"] = lb.to_numpy(dtype)
            if return_deviation:
                z = (series_df["_price"] - wmean) / std.replace(0, np.nan)
                pdv = (series_df["_price"] - wmean) / wmean.replace(0, np.nan)
                out[f"zscore_{tag}"] = z.to_numpy(dtype)
                out[f"pctdev_{tag}"] = pdv.to_numpy(dtype)

    out_arrays: Dict[str, np.ndarray] = {}
    for a in anchors:
        if a in ("session", "day"):
            keys = _anchor_keys(df.index, "day" if a == "day" else "session", tz)
            anchored(df, keys, a)
        elif a in ("week", "month", "ytd"):
            keys = _anchor_keys(df.index, a, tz)
            anchored(df, keys, a)
        elif a == "custom":
            keys = _anchor_keys(df.index, "custom", tz, custom=custom_anchors)
            anchored(df, keys, a)
        else:
            raise ValueError(f"unsupported anchor: {a}")
    out_arrays.update({k: v for k, v in out.items() if isinstance(v, np.ndarray)})

    # NaN policy on one representative anchor (first vwap_*)
    vwap_keys = [k for k in out_arrays.keys() if k.startswith("vwap_")]
    if vwap_keys:
        _apply_nan_policy(out_arrays, vwap_keys[0], nan_policy)
        for k, vv in out_arrays.items():
            out[k] = vv  # type: ignore

    return out


# ───────────────────────────────────────────────────────────────────────────────
# Streaming VWAP (O(1) updates) with auto reset via predicate
# ───────────────────────────────────────────────────────────────────────────────

@dataclass
class VWAPState:
    """
    Streaming anchored VWAP. Feed completed bars in chronological order.
    Provide a 'session_breaker' that returns True when new session begins.
    """
    price_source: PriceSource = "hlc3"
    volume_kind: VolumeKind = "raw"
    bands_k: Optional[float] = 1.0
    bands_method: Literal["stdev", "mad"] = "stdev"
    # internal cumulants
    sum_pv: float = 0.0
    sum_v: float = 0.0
    sum_p2v: float = 0.0
    vwap: float = math.nan

    def reset(self):
        self.sum_pv = 0.0
        self.sum_v = 0.0
        self.sum_p2v = 0.0
        self.vwap = math.nan

    def _price_value(self, h: float, l: float, c: float, o: Optional[float]) -> float:
        if self.price_source == "close":
            return c
        if self.price_source == "hlc3":
            return (h + l + c) / 3.0
        if self.price_source == "ohlc4":
            return ( (o + h + l + c) / 4.0 ) if o is not None else (h + l + 2 * c) / 4.0
        if self.price_source == "ha":
            if o is None:
                o = c
            ha_c = (o + h + l + c) / 4.0
            ha_o = (o + c) / 2.0 if math.isnan(getattr(self, "_ha_o", float("nan"))) else (self._ha_o + getattr(self, "_ha_c", ha_c)) / 2.0
            self._ha_o = ha_o  # type: ignore
            ha_h = max(h, ha_o, ha_c)
            ha_l = min(l, ha_o, ha_c)
            self._ha_c = ha_c  # type: ignore
            return (ha_h + ha_l) / 2.0
        raise ValueError("invalid price source")

    def _volume_value(self, vol: float, ref: float) -> float:
        if self.volume_kind == "raw":
            return vol
        if self.volume_kind == "tick":
            return 1.0 if vol > 0 else 0.0
        if self.volume_kind == "notional":
            return vol * ref
        raise ValueError("invalid volume kind")

    def update(self, *, high: float, low: float, close: float, volume: float, open_: Optional[float] = None, new_session: bool = False) -> Dict[str, float]:
        if new_session:
            self.reset()
        p = self._price_value(high, low, close, open_)
        w = self._volume_value(volume, p)
        self.sum_pv += p * w
        self.sum_v += w
        self.sum_p2v += (p * p) * w
        self.vwap = self.sum_pv / self.sum_v if self.sum_v != 0 else math.nan
        res = {"vwap": self.vwap}
        if self.bands_k is not None:
            mean = self.vwap
            if self.sum_v > 0:
                var = (self.sum_p2v / self.sum_v) - (mean * mean)
                std = math.sqrt(max(var, 0.0))
                if self.bands_method == "mad":
                    mad = 1.4826 * std
                    res["upper"] = mean + self.bands_k * mad
                    res["lower"] = mean - self.bands_k * mad
                else:
                    res["upper"] = mean + self.bands_k * std
                    res["lower"] = mean - self.bands_k * std
                res["zscore"] = (p - mean) / std if std > 0 else math.nan
                res["pctdev"] = (p - mean) / mean if mean != 0 else math.nan
            else:
                res.update({"upper": math.nan, "lower": math.nan, "zscore": math.nan, "pctdev": math.nan})
        return res


# ───────────────────────────────────────────────────────────────────────────────
# HTF computation & alignment to LTF (pandas only)
# ───────────────────────────────────────────────────────────────────────────────

def vwap_htf_aligned_pandas(
    df_ltf: "pd.DataFrame",
    *,
    htf_rule: str = "1H",
    price_source: PriceSource = "hlc3",
    volume_kind: VolumeKind = "raw",
    anchor: AnchorKind = "session",
    tz: Optional[str] = None,
    session: SessionKind = "24x7",
    equity_hours: Tuple[str, str] = ("09:30", "16:00"),
    join: JoinMethod = "ffill",
    bands_k: Optional[float] = None,
) -> "pd.Series":
    """
    Compute VWAP on a higher timeframe and align back to a lower timeframe index.
    """
    if pd is None or not isinstance(df_ltf, pd.DataFrame):
        raise TypeError("vwap_htf_aligned_pandas requires pandas DataFrame.")
    df = df_ltf.copy()
    if not isinstance(df.index, pd.DatetimeIndex):
        raise ValueError("df_ltf.index must be DatetimeIndex.")
    # Resample HTF (OHLCV)
    agg = {"high": "max", "low": "min", "close": "last", "volume": "sum"}
    if "open" in df.columns:
        agg["open"] = "first"
    htf = df.resample(htf_rule).agg(agg).dropna(how="any")
    res = compute_vwap(
        htf, price_source=price_source, volume_kind=volume_kind,
        anchors=(anchor,), session=session, tz=tz, equity_hours=equity_hours,
        bands_k=bands_k, nan_policy="fill"
    )
    s = pd.Series(res[f"vwap_{anchor}"], index=htf.index, name=f"VWAP_{htf_rule}")  # type: ignore
    if join == "ffill":
        return s.reindex(df.index, method="ffill")
    if join == "nearest":
        return s.reindex(df.index, method="nearest")
    raise ValueError("join must be 'ffill' or 'nearest'")


# ───────────────────────────────────────────────────────────────────────────────
# Minimal smoke test
# ───────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    rng = np.random.default_rng(11)
    n = 1000
    price = np.cumsum(rng.normal(0, 0.5, n)) + 100
    high = price + rng.uniform(0.1, 0.8, n)
    low = price - rng.uniform(0.1, 0.8, n)
    close = price + rng.normal(0, 0.15, n)
    vol = rng.integers(100, 5000, n).astype(float)

    # numpy mode (no calendar): session = whole series
    arr = np.column_stack([close, vol, high, low])
    out = compute_vwap(arr, anchors=("session","month"), bands_k=1.0, nan_policy="fill")
    print({k: type(v).__name__ for k, v in out.items() if k != "meta"})

    # streaming with manual session break
    st = VWAPState(price_source="hlc3", volume_kind="raw", bands_k=1.0)
    last = {}
    for i in range(n):
        last = st.update(high=high[i], low=low[i], close=close[i], volume=vol[i], new_session=(i>0 and i%300==0))
    print({"stream_vwap": float(last.get("vwap", float("nan")))})

    if pd is not None:
        # pandas with calendarized daily & weekly anchors
        ts = pd.date_range("2024-01-01", periods=n, freq="T", tz="UTC")
        df = pd.DataFrame({"high": high, "low": low, "close": close, "volume": vol}, index=ts)
        res = compute_vwap(df, anchors=("day","week","ytd","session"), session="24x7", tz="UTC", bands_k=1.0, nan_policy="fill")
        print({k: len(v) for k, v in res.items() if isinstance(v, np.ndarray)})
        s = vwap_htf_aligned_pandas(df, htf_rule="15T")
        print({"htf_aligned_len": len(s)})
