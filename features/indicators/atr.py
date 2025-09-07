"""ATR indicator utilities: computes Average True Range (ATR) using Wilder's smoothing."""
from __future__ import annotations
import pandas as pd
import numpy as np

def compute_atr(
    df: pd.DataFrame,
    high_col: str = "high",
    low_col: str = "low",
    close_col: str = "close",
    period: int = 14
) -> pd.DataFrame:
    """
    Average True Range (ATR). Returns DataFrame with column 'atr'.
    """
    for c in [high_col, low_col, close_col]:
        if c not in df.columns:
            raise KeyError(f"Missing required column: {c}")

    high = df[high_col].astype(float)
    low = df[low_col].astype(float)
    close = df[close_col].astype(float)

    prev_close = close.shift(1)
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr = tr.ewm(alpha=1/period, adjust=False, min_periods=period).mean()
    return pd.DataFrame({"atr": atr})
