# features/feature_builder.py
# -*- coding: utf-8 -*-
"""
Feature Builder for NEXUSA
--------------------------
هدف: ساخت دیتاست فیچری پایدار، قابل تکرار و هماهنگ با مدل‌ها و DAG
خروجی: مسیر فایل Parquet شامل ستون‌های حداقل: ['ts','symbol','tf','close','adx','atr','vwap']

نکات کلیدی:
- بدون وابستگی به سرویس خارجی؛ اگر داده خام موجود نباشد، دیتای مصنوعی پایدار تولید می‌کند.
- محاسبه ایندیکاتورها: ATR، ADX (Wilder) و VWAP
- I/O ایمن: ساخت پوشه‌ها، نام‌گذاری یکتا، خروجی سازگار با MLTrainer (read_parquet)
- Log داخلی برای دیباگ
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, Tuple
import pandas as pd
import numpy as np
import os
import uuid
import logging
from datetime import datetime, timedelta

# ----------------------------
# Logging
# ----------------------------
logger = logging.getLogger("nexusa.feature_builder")
if not logger.handlers:
    logger.setLevel(logging.INFO)
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s - %(message)s"))
    logger.addHandler(_h)

# ----------------------------
# Config
# ----------------------------
@dataclass(frozen=True)
class BuilderConfig:
    """تنظیمات ساخت دیتاست فیچری.

    Attributes
    ----------
    symbol : str
        نماد دارایی (پیش‌فرض: 'BTCUSDT').
    tf : str
        تایم‌فریم دیتای OHLCV (مثل '1h').
    adx_window : int
        طول پنجره هموارسازی Wilder برای ADX.
    atr_window : int
        طول پنجره هموارسازی Wilder برای ATR.
    min_rows : int
        حداقل تعداد ردیف برای پایداری محاسبات.
    out_dir : str
        مسیر خروجی ذخیره فایل‌های فیچر (Parquet).
    seed : int
        بذر تصادفی برای reproducibility در تولید داده مصنوعی.
    raw_path : Optional[str]
        مسیر فایل دیتای خام OHLCV (در صورت وجود). اگر None باشد، داده مصنوعی تولید می‌شود.
    """
    symbol: str = "BTCUSDT"
    tf: str = "1h"
    adx_window: int = 14
    atr_window: int = 14
    min_rows: int = 500        # حداقل سطر برای محاسبات پایدار
    out_dir: str = "datasets"
    seed: int = 42             # برای reproducibility
    # در صورت داشتن داده خام:
    raw_path: Optional[str] = None  # e.g., "datasets/raw_ohlcv.parquet"

# ----------------------------
# Public API
# ----------------------------
def build(cfg: Optional[BuilderConfig] = None) -> str:
    """
    Build feature dataset and return the Parquet path.
    این تابع توسط DAG فراخوانی می‌شود: features.feature_builder.build()

    Parameters
    ----------
    cfg : Optional[BuilderConfig]
        تنظیمات ساخت. اگر None باشد، مقادیر پیش‌فرض استفاده می‌شود.

    Returns
    -------
    str
        مسیر فایل Parquet خروجی.
    """
    cfg = cfg or BuilderConfig()
    os.makedirs(cfg.out_dir, exist_ok=True)

    logger.info("Starting feature build | symbol=%s tf=%s", cfg.symbol, cfg.tf)

    # 1) Load raw OHLCV or synthesize
    df = _load_or_synthesize_ohlcv(cfg)

    # 2) Compute indicators (ATR, ADX, VWAP)
    df_feat = _compute_indicators(df, adx_n=cfg.adx_window, atr_n=cfg.atr_window)

    # 3) Sanity & minimal schema for model
    needed_cols = ["ts", "symbol", "tf", "close", "adx", "atr", "vwap"]
    missing = [c for c in needed_cols if c not in df_feat.columns]
    if missing:
        raise ValueError(f"Missing required columns in features: {missing}")

    # 4) Save parquet
    out_path = os.path.join(cfg.out_dir, f"features_{uuid.uuid4().hex[:8]}.parquet")
    try:
        df_feat[needed_cols].to_parquet(out_path, index=False)
    except Exception as e:
        logger.error("Failed to write Parquet. Ensure pyarrow/fastparquet installed. Err=%s", e)
        raise

    logger.info("Feature dataset written to %s (rows=%d)", out_path, len(df_feat))
    return out_path

# ----------------------------
# Data Loading / Synthesis
# ----------------------------
def _load_or_synthesize_ohlcv(cfg: BuilderConfig) -> pd.DataFrame:
    """
    تلاش برای بارگذاری دیتای خام؛ در صورت نبود، دیتای مصنوعی پایدار می‌سازد.
    ساختار مورد انتظار: ts, open, high, low, close, volume
    """
    if cfg.raw_path and os.path.exists(cfg.raw_path):
        logger.info("Loading raw OHLCV from %s", cfg.raw_path)
        raw = pd.read_parquet(cfg.raw_path)
        # اطمینان از ستون‌ها
        expected = {"ts", "open", "high", "low", "close", "volume"}
        missing = expected - set(raw.columns)
        if missing:
            raise ValueError(f"Raw OHLCV missing columns: {missing}")
        raw = _ensure_ts(raw)
        if len(raw) < cfg.min_rows:
            logger.warning("Raw OHLCV rows (%d) < min_rows (%d); augmenting synthetic tail",
                           len(raw), cfg.min_rows)
            synth = _make_synth_ohlcv(cfg, rows=cfg.min_rows - len(raw), start_ts=raw["ts"].iloc[-1])
            raw = pd.concat([raw, synth], ignore_index=True)
        raw["symbol"] = cfg.symbol
        raw["tf"] = cfg.tf
        return raw

    logger.warning("No raw OHLCV found. Generating synthetic series (symbol=%s tf=%s).",
                   cfg.symbol, cfg.tf)
    return _make_synth_ohlcv(cfg, rows=max(cfg.min_rows, 600))

def _ensure_ts(df: pd.DataFrame) -> pd.DataFrame:
    """ستون «ts» را به نوع datetime با timezone UTC یکسان‌سازی می‌کند.

    رفتار:
      - اگر dtype ستون ts عددی (int/float) باشد، آن را به ثانیه‌ی epoch فرض کرده و
        با `pd.to_datetime(..., unit="s", utc=True)` تبدیل می‌کند.
      - در غیر این صورت از `pd.to_datetime(..., utc=True)` برای پارس رشته/آبجکت استفاده می‌کند.
    این تابع یک کپی از DataFrame برمی‌گرداند تا از side-effect جلوگیری شود.
    """
    if np.issubdtype(df["ts"].dtype, np.integer) or np.issubdtype(df["ts"].dtype, np.floating):
        df = df.copy()
        df["ts"] = pd.to_datetime(df["ts"], unit="s", utc=True)
    else:
        df = df.copy()
        df["ts"] = pd.to_datetime(df["ts"], utc=True)
    return df

def _make_synth_ohlcv(cfg: BuilderConfig, rows: int = 600, start_ts: Optional[pd.Timestamp] = None) -> pd.DataFrame:
    """
    تولید دیتای مصنوعی واقع‌گرایانه (OHLCV) با random walk + نوسان‌پذیری.
    """
    rng = np.random.default_rng(cfg.seed)
    # time grid
    if start_ts is None:
        start_ts = pd.Timestamp.utcnow().floor("H") - pd.Timedelta(hours=rows)
    idx = pd.date_range(start_ts, periods=rows, freq=cfg.tf, inclusive="right")

    # price path
    price = 100.0
    prices = []
    vols = []
    for _ in range(rows):
        drift = rng.normal(0, 0.02)
        vol = abs(rng.normal(1_000_000, 100_000))
        price = max(1e-6, price * (1 + drift/100))  # درصدی
        prices.append(price)
        vols.append(vol)

    close = np.array(prices)
    # high/low/open around close
    high = close * (1 + np.abs(rng.normal(0.002, 0.001, size=rows)))
    low = close * (1 - np.abs(rng.normal(0.002, 0.001, size=rows)))
    open_ = (high + low + close) / 3.0 + rng.normal(0, 0.1, size=rows)

    df = pd.DataFrame({
        "ts": idx,
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": vols,
        "symbol": cfg.symbol,
        "tf": cfg.tf,
    })
    return df

# ----------------------------
# Indicators (ATR, ADX, VWAP)
# ----------------------------
def _compute_indicators(df: pd.DataFrame, adx_n: int = 14, atr_n: int = 14) -> pd.DataFrame:
    """
    محاسبه اندیکاتورهای اصلی مورد نیاز مدل: ATR, ADX(Wilder), VWAP
    """
    d = df.copy().sort_values("ts")
    d["prev_close"] = d["close"].shift(1)
    d["prev_high"] = d["high"].shift(1)
    d["prev_low"] = d["low"].shift(1)

    # True Range
    tr = pd.concat([
        (d["high"] - d["low"]).abs(),
        (d["high"] - d["prev_close"]).abs(),
        (d["low"] - d["prev_close"]).abs()
    ], axis=1).max(axis=1)
    # Wilder smoothing via ewm(alpha=1/n)
    d["atr"] = tr.ewm(alpha=1/atr_n, adjust=False).mean()

    # Directional Movement
    up_move = d["high"] - d["prev_high"]
    down_move = d["prev_low"] - d["low"]
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    plus_dm = pd.Series(plus_dm, index=d.index)
    minus_dm = pd.Series(minus_dm, index=d.index)

    # Wilder smoothing for DM and TR
    tr_n = tr.ewm(alpha=1/adx_n, adjust=False).mean()
    plus_dm_n = plus_dm.ewm(alpha=1/adx_n, adjust=False).mean()
    minus_dm_n = minus_dm.ewm(alpha=1/adx_n, adjust=False).mean()

    plus_di = 100 * (plus_dm_n / tr_n).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    minus_di = 100 * (minus_dm_n / tr_n).replace([np.inf, -np.inf], np.nan).fillna(0.0)

    dx = (100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)).fillna(0.0)
    adx = dx.ewm(alpha=1/adx_n, adjust=False).mean()
    d["adx"] = adx

    # VWAP
    typical_price = (d["high"] + d["low"] + d["close"]) / 3.0
    cum_v = d["volume"].cumsum().replace(0, np.nan)
    cum_vp = (typical_price * d["volume"]).cumsum()
    d["vwap"] = (cum_vp / cum_v).fillna(method="ffill").fillna(method="bfill")

    # Clean up
    d = d.drop(columns=["prev_close", "prev_high", "prev_low"])
    # Forward-fill for early NA due to smoothing warmup
    for col in ["atr", "adx", "vwap"]:
        d[col] = d[col].fillna(method="ffill").fillna(method="bfill")

    return d
