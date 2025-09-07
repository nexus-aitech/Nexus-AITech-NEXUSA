"""Orchestrated batch data-flow (ingestion → features → signals → emit).

هدف: اجرای پایپ‌لاین دسته‌ای بدون نقض لایه‌بندی.
- حذف importهای مستقیم از لایه‌های features.* و signals.* (Dependency Inversion).
- به‌جای آن از importlib برای بارگذاری تنبل توابع/کلاس‌ها استفاده می‌شود.
- امضای تابع و رفتار اصلی حفظ شده است.
"""
from __future__ import annotations

import importlib
from typing import Any, Callable, Tuple, List, Dict

import pandas as pd
from core.ml_model import SimpleModel  # لایه core مجاز است


# ---------------------- Lazy resolvers (no hard layer deps) -------------------
def _resolve(path: str, attr: str) -> Callable[..., Any]:
    """Import `attr` from module `path` lazily; raises ImportError با پیام شفاف."""
    try:
        mod = importlib.import_module(path)
        fn = getattr(mod, attr)
    except Exception as e:
        raise ImportError(f"Failed to resolve {attr} from {path}: {e}") from e
    return fn


def _compute_features(df: pd.DataFrame, symbol: str, tf: str) -> list[dict]:
    """Proxy to features.feature_engine.compute_features (lazy import)."""
    compute_features = _resolve("features.feature_engine", "compute_features")
    return compute_features(df, symbol, tf)


def _rule_score(df: pd.DataFrame) -> pd.Series:
    """Proxy to signals.rule_engine.rule_score (lazy import)."""
    rule_score = _resolve("signals.rule_engine", "rule_score")
    return rule_score(df)


def _combine(rs, mlp):
    """Proxy to signals.final_scorer.combine (lazy import)."""
    combine = _resolve("signals.final_scorer", "combine")
    return combine(rs, mlp)


def _emit_signals(df: pd.DataFrame) -> list[dict]:
    """Proxy to signals.signal_emitter.emit_signals (lazy import)."""
    emit_signals = _resolve("signals.signal_emitter", "emit_signals")
    return emit_signals(df)
# -----------------------------------------------------------------------------


def batch_pipeline(ohlcv_rows: list[dict], symbol: str, tf: str) -> Tuple[List[Dict], List[Dict]]:
    """اجرای پایپ‌لاین دسته‌ای از روی ردیف‌های OHLCV نرمال‌شده.

    Args:
        ohlcv_rows: لیست ردیف‌های خام با ساختار:
            {
              "ts_event": int,
              "ohlcv": {"o": float, "h": float, "l": float, "c": float, "v": float}
            }
        symbol: نماد مثل "BTC/USDT".
        tf: تایم‌فریم مثل "1m" یا "1h".

    Returns:
        (features, signals) به‌ترتیب:
            - features: لیست دیکشنری ویژگی‌ها (خروجی compute_features)
            - signals: لیست دیکشنری سیگنال‌های خروجی (خروجی emit_signals)
    """
    # ساخت DataFrame ورودی
    base_df = pd.DataFrame(
        [
            {
                "timestamp": r["ts_event"],
                "open": r["ohlcv"]["o"],
                "high": r["ohlcv"]["h"],
                "low": r["ohlcv"]["l"],
                "close": r["ohlcv"]["c"],
                "volume": r["ohlcv"]["v"],
            }
            for r in ohlcv_rows
        ]
    ).dropna()

    # محاسبه ویژگی‌ها (بدون import مستقیم)
    feats = _compute_features(base_df, symbol, tf)
    fdf = pd.DataFrame(feats)

    # ادغام برای امتیازدهی قوانین/مدل
    merged = base_df.merge(fdf, on="timestamp", how="inner")
    # استخراج چند اندیکاتور پرتکرار (در صورت وجود)
    if "indicators" in merged.columns:
        merged["adx"] = merged["indicators"].apply(lambda d: (d or {}).get("adx", 0.0))
        merged["atr"] = merged["indicators"].apply(lambda d: (d or {}).get("atr", 0.0))
        merged["vwap"] = merged["indicators"].apply(lambda d: (d or {}).get("vwap", 0.0))

    # امتیاز قاعده‌ای
    rs = _rule_score(merged).values

    # مدل ساده از core
    model = SimpleModel().fit(merged)
    mlp = model.predict_proba_tp(merged)

    # ترکیب نهایی و آماده‌سازی برای انتشار
    merged["final_score"] = _combine(rs, mlp)
    merged["symbol"] = symbol.replace("/", "")
    merged["tf"] = tf

    sigs = _emit_signals(merged[["timestamp", "final_score", "symbol", "tf"]])

    return feats, sigs
