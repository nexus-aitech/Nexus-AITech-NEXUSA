"""VWAP indicator utilities: session-based Volume Weighted Average Price reset each session."""
from __future__ import annotations
import pandas as pd
import numpy as np
from typing import Optional

def compute_vwap(
    df: pd.DataFrame,
    high_col: str = "high",
    low_col: str = "low",
    close_col: str = "close",
    volume_col: str = "volume",
    ts_col: str = "ts_event",
    session: str = "1D"
) -> pd.DataFrame:
    """
    Volume Weighted Average Price (VWAP) reset each session (default: daily).
    Requires a datetime-like column `ts_col`.

    Returns DataFrame with column 'vwap'.
    """
    required = {high_col, low_col, close_col, volume_col, ts_col}
    missing = required - set(df.columns)
    if missing:
        raise KeyError(f"Missing required columns for VWAP: {missing}")

    work = df[[high_col, low_col, close_col, volume_col, ts_col]].copy()
    work[ts_col] = pd.to_datetime(work[ts_col], utc=True, errors="coerce")

    typical = (work[high_col] + work[low_col] + work[close_col]) / 3.0
    pv = typical * work[volume_col]

    # Define session grouping
    if session.upper() in ("1D","D","DAY","DAILY"):
        key = work[ts_col].dt.date
    else:
        # Use pandas Grouper for generic frequencies
        key = pd.Grouper(key=ts_col, freq=session)

    df2 = pd.DataFrame({
        "pv": pv,
        "vol": work[volume_col].astype(float),
        ts_col: work[ts_col]
    }).set_index(work[ts_col])

    if isinstance(key, pd.Grouper):
        grouped = df2.groupby(key)
        csum_pv = grouped["pv"].cumsum()
        csum_vol = grouped["vol"].cumsum()
    else:
        # group by date key
        df2["_date_key"] = pd.to_datetime(work[ts_col].dt.date)
        grouped = df2.groupby("_date_key")
        csum_pv = grouped["pv"].cumsum()
        csum_vol = grouped["vol"].cumsum()

    vwap = (csum_pv / csum_vol).replace([np.inf, -np.inf], np.nan)
    return pd.DataFrame({"vwap": vwap.values}, index=df.index)
