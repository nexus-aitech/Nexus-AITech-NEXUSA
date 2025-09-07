# -*- coding: utf-8 -*-
"""
Quality Control for Feature Engineering
======================================
ابزارهای کنترل کیفیت برای دیتافریم‌های فیچر شامل:
- iqr_clip: برش نقاط دورافتاده با استفاده از IQR به ازای هر ستون عددی
- forward_fill_small_gaps: پرکردن شکاف‌های کوچک به‌صورت ffill با حد آستانه
- invalid_feature_rate: محاسبه نرخ مقادیر نامعتبر (NaN/Inf) به تفکیک ستون و مجموع
- clean_and_score: اجرای pipeline تمیزسازی و بازگرداندن متریک‌های کیفیت
"""

from __future__ import annotations
import pandas as pd
import numpy as np
from typing import Dict, Tuple

def iqr_clip(df: pd.DataFrame, k: float = 1.5) -> pd.DataFrame:
    """
    Clip outliers using IQR for each numeric column.
    """
    out = df.copy()
    numeric_cols = out.select_dtypes(include=[np.number]).columns
    for c in numeric_cols:
        q1 = out[c].quantile(0.25)
        q3 = out[c].quantile(0.75)
        iqr = q3 - q1
        if np.isfinite(iqr) and iqr > 0:
            lower = q1 - k * iqr
            upper = q3 + k * iqr
            out[c] = out[c].clip(lower, upper)
    return out

def forward_fill_small_gaps(df: pd.DataFrame, limit: int = 1) -> pd.DataFrame:
    """
    Forward-fill gaps for up to `limit` consecutive NaNs.
    """
    return df.ffill(limit=limit)

def invalid_feature_rate(df: pd.DataFrame) -> Dict[str, float]:
    """
    Percentage of invalid (NaN or inf) values per column.
    """
    rates: Dict[str, float] = {}
    n = len(df)
    if n == 0:
        return {c: 0.0 for c in df.columns}
    for c in df.columns:
        col = df[c]
        inv = (~np.isfinite(col.to_numpy(dtype=float, copy=False))).sum() if np.issubdtype(col.dtype, np.number) else col.isna().sum()
        rates[c] = float(inv) / n
    rates["_overall"] = float(sum(df.isna().sum())) / (n * max(1,len(df.columns)))
    return rates

def clean_and_score(df: pd.DataFrame, iqr_k: float = 1.5, ffill_limit: int = 1) -> Tuple[pd.DataFrame, Dict[str, float]]:
    """
    Apply IQR clipping and forward-fill small gaps; return cleaned df and invalid_feature_rate.
    """
    cleaned = iqr_clip(df, k=iqr_k)
    cleaned = forward_fill_small_gaps(cleaned, limit=ffill_limit)
    metrics = invalid_feature_rate(cleaned)
    return cleaned, metrics
