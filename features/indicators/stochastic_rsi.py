# -*- coding: utf-8 -*-
"""Stochastic RSI indicator utilities: RSI helper and Stochastic RSI computation."""

from __future__ import annotations
import pandas as pd
import numpy as np

def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Compute Wilder-style Relative Strength Index (RSI).

    Parameters
    ----------
    close : pd.Series
        Closing price series.
    period : int, default 14
        Smoothing period for exponential moving averages of gains/losses.

    Returns
    -------
    pd.Series
        RSI values in range [0, 100], aligned with the input index.
    """
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1/period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1/period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi

def compute_stochastic_rsi(
    df: pd.DataFrame,
    close_col: str = "close",
    rsi_period: int = 14,
    stoch_period: int = 14,
    k_period: int = 3,
    d_period: int = 3
) -> pd.DataFrame:
    """
    Stochastic RSI oscillator.
    Returns DataFrame with columns: rsi, stoch_rsi, stoch_rsi_k, stoch_rsi_d
    """
    if close_col not in df.columns:
        raise KeyError(f"Missing required column: {close_col}")

    close = df[close_col].astype(float)
    rsi = _rsi(close, period=rsi_period)

    min_rsi = rsi.rolling(window=stoch_period, min_periods=stoch_period).min()
    max_rsi = rsi.rolling(window=stoch_period, min_periods=stoch_period).max()
    stoch_rsi = (rsi - min_rsi) / (max_rsi - min_rsi)
    stoch_rsi = stoch_rsi.clip(0.0, 1.0)

    k = stoch_rsi.rolling(window=k_period, min_periods=k_period).mean()
    d = k.rolling(window=d_period, min_periods=d_period).mean()

    out = pd.concat([
        rsi.rename("rsi"),
        stoch_rsi.rename("stoch_rsi"),
        k.rename("stoch_rsi_k"),
        d.rename("stoch_rsi_d")
    ], axis=1)
    return out
