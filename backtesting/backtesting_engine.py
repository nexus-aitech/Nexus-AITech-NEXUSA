"""Backtesting engine utilities for computing evaluation metrics in NEXUSA.

This module provides lightweight evaluation over generated trade signals
against a price series. Side effects are minimized; heavy operations are
avoided at import time.
"""

from __future__ import annotations
import pandas as pd
import numpy as np


def evaluate(signals_df: pd.DataFrame, price_df: pd.DataFrame) -> dict:
    """Evaluate signals against prices and compute basic performance metrics.

    Args:
        signals_df: DataFrame containing at least ['timestamp', 'direction'] where
            'direction' is typically 'Long' or 'Short'.
        price_df: DataFrame containing at least ['timestamp', 'close'] prices.

    Returns:
        dict: {
            'trades': int         # number of executed round-trip trade actions
            'pnl': float          # cumulative simple PnL over closed trades (ratio)
            'sharpe': float       # naive Sharpe using hourly approximation
            'max_dd': float       # maximum drawdown over the price series (ratio)
        }
    """
    df = (
        signals_df.merge(price_df[["timestamp", "close"]], on="timestamp", how="left")
        .sort_values("timestamp")
    )

    pnl = 0.0
    trades = 0
    pos = 0
    entry = 0.0

    for row in df.itertuples(index=False):
        if row.direction == "Long" and pos == 0:
            pos = 1
            entry = row.close
            trades += 1
        elif row.direction == "Short" and pos == 1:
            pnl += (row.close - entry) / entry
            pos = 0

    # metrics
    ret = df["close"].pct_change().fillna(0)
    sharpe = (ret.mean() / (ret.std() + 1e-9)) * np.sqrt(365 * 24)  # hourly approx
    max_dd = _max_drawdown(df["close"].values)
    return {"trades": trades, "pnl": float(pnl), "sharpe": float(sharpe), "max_dd": float(max_dd)}


def _max_drawdown(series: np.ndarray) -> float:
    """Compute the maximum drawdown of a price series.

    Args:
        series: Numpy array (or array-like) of price levels.

    Returns:
        float: Maximum drawdown ratio in [0, 1].
    """
    import numpy as np
    peak = -np.inf
    max_dd = 0.0
    for x in series:
        peak = max(peak, x)
        dd = (peak - x) / (peak + 1e-9)
        max_dd = max(max_dd, dd)
    return max_dd
