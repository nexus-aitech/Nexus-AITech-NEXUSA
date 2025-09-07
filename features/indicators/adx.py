# -*- coding: utf-8 -*-
"""
ADX Indicator
=============
ابزارهای محاسبهٔ Average Directional Index (ADX) به‌همراه +DI و -DI.

توابع:
- _true_range: محاسبهٔ True Range بر اساس روش Wilder.
- compute_adx: محاسبهٔ +DI، -DI، DX و ADX.

خروجی compute_adx شامل ستون‌های:
    adx_plus_di, adx_minus_di, adx_dx, adx
"""

from __future__ import annotations
import pandas as pd
import numpy as np
from typing import Tuple


def _true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    """محاسبهٔ True Range بر اساس روش Wilder.

    Parameters
    ----------
    high : pd.Series
        سری مقادیر high.
    low : pd.Series
        سری مقادیر low.
    close : pd.Series
        سری مقادیر close.

    Returns
    -------
    pd.Series
        سری True Range هم‌تراز با ورودی‌ها.
    """
    prev_close = close.shift(1)
    tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    return tr


def compute_adx(
    df: pd.DataFrame,
    high_col: str = "high",
    low_col: str = "low",
    close_col: str = "close",
    period: int = 14
) -> pd.DataFrame:
    """
    Average Directional Index (ADX) with +DI and -DI.

    Returns DataFrame with columns: plus_di, minus_di, dx, adx
    """
    for c in [high_col, low_col, close_col]:
        if c not in df.columns:
            raise KeyError(f"Missing required column: {c}")

    high = df[high_col].astype(float)
    low = df[low_col].astype(float)
    close = df[close_col].astype(float)

    up_move = high.diff()
    down_move = low.diff().mul(-1)

    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    plus_dm = pd.Series(plus_dm, index=df.index)
    minus_dm = pd.Series(minus_dm, index=df.index)

    tr = _true_range(high, low, close)

    # Wilder's smoothing
    tr_s = tr.ewm(alpha=1/period, adjust=False).mean()
    plus_dm_s = plus_dm.ewm(alpha=1/period, adjust=False).mean()
    minus_dm_s = minus_dm.ewm(alpha=1/period, adjust=False).mean()

    plus_di = 100 * (plus_dm_s / tr_s).replace({0: np.nan})
    minus_di = 100 * (minus_dm_s / tr_s).replace({0: np.nan})

    dx = (100 * (plus_di - minus_di).abs() / (plus_di + minus_di)).replace([np.inf, -np.inf], np.nan)

    adx = dx.ewm(alpha=1/period, adjust=False, min_periods=period).mean()

    out = pd.concat([plus_di.rename("adx_plus_di"), minus_di.rename("adx_minus_di"),
                     dx.rename("adx_dx"), adx.rename("adx")], axis=1)
    return out
