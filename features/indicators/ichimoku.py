# -*- coding: utf-8 -*-
"""
Ichimoku Indicator
==================
محاسبه مؤلفه‌های ایچیموکو شامل:
- تنکان‌سن (Conversion Line)
- کیجون‌سن (Base Line)
- سنکو A و B (به جلو شیفت‌داده‌شده با مقدار kijun)
- چیکو اسپن (به عقب شیفت‌داده‌شده با مقدار kijun)

خروجی تابع `compute_ichimoku` شامل ستون‌های:
    ichimoku_tenkan, ichimoku_kijun, ichimoku_senkou_a, ichimoku_senkou_b, ichimoku_chikou
"""

from __future__ import annotations
import pandas as pd
import numpy as np
from typing import Dict

def _midpoint(series: pd.Series, window: int) -> pd.Series:
    """میانگین بازهٔ [بیشینهٔ High، کمینهٔ Low] را روی یک پنجرهٔ رولینگ برمی‌گرداند.

    نکته: پارامتر `series` در عمل یک DataFrame کوچک با ستون‌های 'high' و 'low' است
    (slice شده از df اصلی). این تابع حداکثر high و حداقل low را در هر پنجرهٔ
    `window`-تایی محاسبه کرده و سپس میانگین آن دو را به‌عنوان خط مبنا بازمی‌گرداند.

    Parameters
    ----------
    series : pd.DataFrame-like
        آبجکتی شامل ستون‌های 'high' و 'low'.
    window : int
        طول پنجرهٔ رولینگ.

    Returns
    -------
    pd.Series
        سری میانی (midpoint) هم‌تراز با ورودی.
    """
    high = series["high"].rolling(window=window, min_periods=window).max()
    low = series["low"].rolling(window=window, min_periods=window).min()
    return (high + low) / 2.0

def compute_ichimoku(
    df: pd.DataFrame,
    high_col: str = "high",
    low_col: str = "low",
    close_col: str = "close",
    tenkan: int = 9,
    kijun: int = 26,
    senkou_b: int = 52,
) -> pd.DataFrame:
    """
    Compute Ichimoku components.

    Returns a DataFrame with columns:
      - ichimoku_tenkan
      - ichimoku_kijun
      - ichimoku_senkou_a (shifted +kijun)
      - ichimoku_senkou_b (shifted +kijun)
      - ichimoku_chikou (shifted -kijun)
    """
    if not {high_col, low_col, close_col}.issubset(df.columns):
        missing = {high_col, low_col, close_col} - set(df.columns)
        raise KeyError(f"Missing required columns for Ichimoku: {missing}")

    work = df[[high_col, low_col, close_col]].rename(columns={high_col: "high", low_col: "low", close_col: "close"}).copy()

    conv = (_midpoint(work, tenkan)).rename("ichimoku_tenkan")
    base = (_midpoint(work, kijun)).rename("ichimoku_kijun")
    span_b = (_midpoint(work, senkou_b)).rename("ichimoku_senkou_b")

    span_a = ((conv + base) / 2.0).rename("ichimoku_senkou_a")
    chikou = work["close"].shift(-kijun).rename("ichimoku_chikou")

    # Shift spans forward by kijun periods
    span_a_f = span_a.shift(kijun)
    span_b_f = span_b.shift(kijun)

    out = pd.concat([conv, base, span_a_f, span_b_f, chikou], axis=1)
    return out
