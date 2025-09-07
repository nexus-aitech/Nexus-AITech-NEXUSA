"""On-Balance Volume (OBV) indicator utilities."""
from __future__ import annotations
import pandas as pd
import numpy as np

def compute_obv(
    df: pd.DataFrame,
    close_col: str = "close",
    volume_col: str = "volume"
) -> pd.DataFrame:
    """
    On-Balance Volume (OBV). Returns DataFrame with column 'obv'.
    """
    for c in [close_col, volume_col]:
        if c not in df.columns:
            raise KeyError(f"Missing required column: {c}")

    close = df[close_col].astype(float)
    vol = df[volume_col].astype(float)

    direction = np.sign(close.diff()).fillna(0.0)
    obv = (direction * vol).cumsum()
    return pd.DataFrame({"obv": obv})
