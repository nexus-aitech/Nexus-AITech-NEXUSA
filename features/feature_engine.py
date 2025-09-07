# -*- coding: utf-8 -*-
"""
Feature Engine
==============
Pipeline محاسبه فیچرهای قطعی با کنترل کیفیت و اعتبارسنجی اسکیما بدون وابستگی به لایهٔ storage.

ورودی موردنیاز ستون‌ها:
    ['symbol', 'timeframe', 'ts_event', 'open', 'high', 'low', 'close', 'volume']

خروجی:
    دیتافریم شامل ستون‌های ورودیِ کلیدی + ستون‌های فیچر نام‌فضا‌گذاری‌شده + ستون 'feature_hash'
"""

from __future__ import annotations

import os
import json
import hashlib
import pandas as pd
import numpy as np
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Any

from features.indicators import ichimoku, adx, stochastic_rsi, atr, vwap, obv
from features.quality_control import clean_and_score
# ⛔️ حذف وابستگی به storage.schema_registry برای رفع LAYER_VIOLATION
from core.schema.feature_schema import FEATURE_SCHEMA, FEATURE_SCHEMA_NAME, FEATURE_SCHEMA_V
from core.observability import Timer, observe_feature_latency

# --- local schema validator (بدون تکیه بر reports/* یا storage/*) ---
try:
    from jsonschema import Draft7Validator  # type: ignore
except Exception:  # pragma: no cover
    Draft7Validator = None  # type: ignore

# مخزن لوکال اسکیماها (بدون import از storage)
_SCHEMAS: Dict[tuple[str, str], Dict[str, Any]] = {
    (FEATURE_SCHEMA_NAME, FEATURE_SCHEMA_V): FEATURE_SCHEMA
}


def _ensure_schema(name: str, version: str, payload: Dict[str, Any]) -> None:
    """اعتبارسنجی payload طبق اسکیما‌ی ثبت‌شدهٔ لوکال.

    اگر کتابخانهٔ jsonschema موجود نباشد یا اسکیما یافت نشود، تابع به‌صورت best-effort هیچ
    استثنایی پرتاب نمی‌کند تا وابستگی سخت ایجاد نشود.

    Parameters
    ----------
    name : str
        نام اسکیما (مثلاً FEATURE_SCHEMA_NAME).
    version : str
        نسخهٔ اسکیما (مثلاً FEATURE_SCHEMA_V).
    payload : Dict[str, Any]
        شئِ داده برای اعتبارسنجی.
    """
    schema = _SCHEMAS.get((name, version))
    if schema is None or Draft7Validator is None:
        return
    validator = Draft7Validator(schema)
    errs = sorted(validator.iter_errors(payload), key=lambda e: e.path)
    if errs:
        e = errs[0]
        path = ".".join(str(p) for p in e.path)
        raise ValueError(f"[{name} v{version}] schema failed at {path}: {e.message}")


log = logging.getLogger("feature_engine")

# نگاشت نام → فانکشن محاسبه
INDICATOR_FUNCS = {
    "ichimoku": ichimoku.compute_ichimoku,
    "adx": adx.compute_adx,
    "stochastic_rsi": stochastic_rsi.compute_stochastic_rsi,
    "atr": atr.compute_atr,
    "vwap": vwap.compute_vwap,
    "obv": obv.compute_obv,
}


def _stable_code_hash() -> str:
    """Hash سورس این ماژول + indicatorها برای ورژن‌بندی قطعی."""
    h = hashlib.sha256()
    try:
        base_dir = os.path.dirname(__file__)
        paths = [
            __file__,
            os.path.join(base_dir, "indicators", "ichimoku.py"),
            os.path.join(base_dir, "indicators", "adx.py"),
            os.path.join(base_dir, "indicators", "stochastic_rsi.py"),
            os.path.join(base_dir, "indicators", "atr.py"),
            os.path.join(base_dir, "indicators", "vwap.py"),
            os.path.join(base_dir, "indicators", "obv.py"),
        ]
        for p in paths:
            if os.path.exists(p):
                with open(p, "rb") as f:
                    h.update(f.read())
    except Exception:
        # در صورت عدم دسترسی به فایل‌ها، همچنان hash فعلی تولید می‌شود
        pass
    return h.hexdigest()[:16]


CODE_HASH = _stable_code_hash()


@dataclass
class FeatureSpec:
    """تعریف یک فیچر/اندیکاتور واحد.

    Attributes
    ----------
    name : str
        نام اندیکاتور (مثلاً 'adx', 'atr', ...).
    params : Dict[str, Any]
        پارامترهای دلخواه برای تابع محاسبهٔ همان اندیکاتور.
    """
    name: str
    params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FeatureEngineConfig:
    """پیکربندی موتور محاسبهٔ فیچر.

    Attributes
    ----------
    features : List[FeatureSpec]
        لیست فیچرهای موردنیاز و پارامترهای آن‌ها.
    iqr_k : float
        ضریب IQR برای حذف نقاط دورافتاده در کنترل کیفیت.
    ffill_limit : int
        حداکثر تعداد پرکردنِ رو‌به‌جلو برای مقادیر خالی پس از QC.
    """
    features: List[FeatureSpec]
    iqr_k: float = 1.5
    ffill_limit: int = 1


class FeatureEngine:
    """
    موتور محاسبهٔ فیچرهای قطعی با هشِ خروجی‌ها جهت reproducibility.

    ورودی موردنیاز ستون‌ها:
        symbol, timeframe, ts_event, open, high, low, close, volume
    """

    def __init__(self, config: FeatureEngineConfig) -> None:
        """سازندهٔ FeatureEngine.

        Parameters
        ----------
        config : FeatureEngineConfig
            پیکربندی شامل فهرست فیچرها و پارامترهای QC.
        """
        self.config = config

    @staticmethod
    def _canonicalize(df: pd.DataFrame) -> pd.DataFrame:
        """یکنواخت‌سازی ترتیب و انواع داده‌ها برای محاسبات قابل‌تکرار.

        - ts_event به datetime UTC تبدیل می‌شود.
        - سورت پایدار بر اساس ['symbol', 'timeframe', 'ts_event'].
        """
        df2 = df.copy()
        df2["ts_event"] = pd.to_datetime(df2["ts_event"], utc=True, errors="coerce")
        df2 = df2.sort_values(
            ["symbol", "timeframe", "ts_event"], kind="mergesort"
        ).reset_index(drop=True)
        return df2

    def _compute_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """محاسبهٔ اندیکاتورها طبق FeatureSpecهای پیکربندی.

        هر اندیکاتور خروجی چندستونی ممکن دارد. ستون‌ها با نام‌فضای اندیکاتور
        پیشوندگذاری می‌شوند تا برخورد نام رخ ندهد.
        """
        out = pd.DataFrame(index=df.index)
        for spec in self.config.features:
            fn = INDICATOR_FUNCS.get(spec.name)
            if fn is None:
                raise KeyError(f"Unknown indicator: {spec.name}")
            vals = fn(df, **spec.params)
            for c in vals.columns:
                col = f"{spec.name}_{c}" if not c.startswith(spec.name) else c
                if col in out.columns:
                    raise ValueError(f"Duplicate feature column after namespacing: {col}")
                out[col] = vals[c].astype(float)
        return out

    @staticmethod
    def _row_hash(row: pd.Series, feature_cols: List[str]) -> str:
        """تولید هش پایدار برای یک ردیف فیچر بر اساس داده‌ها و CODE_HASH."""
        payload = {
            "symbol": row.get("symbol"),
            "timeframe": row.get("timeframe"),
            "ts_event": pd.to_datetime(row.get("ts_event")).isoformat(),
            "features": [
                None if (pd.isna(row[c]) or not np.isfinite(row[c]))
                else float(np.round(row[c], 10))
                for c in feature_cols
            ],
            "code_hash": CODE_HASH,
        }
        s = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(s.encode("utf-8")).hexdigest()

    def compute(self, df: pd.DataFrame) -> pd.DataFrame:
        """اجرای کامل pipeline محاسبهٔ فیچر + QC + هش‌گذاری + اعتبارسنجی اسکیما.

        Parameters
        ----------
        df : pd.DataFrame
            دیتافریم ورودی با ستون‌های لازم.

        Returns
        -------
        pd.DataFrame
            دیتافریم خروجی شامل ستون‌های ورودی کلیدی، ستون‌های فیچر و 'feature_hash'.
        """
        required = {"symbol", "timeframe", "ts_event", "open", "high", "low", "close", "volume"}
        missing = required - set(df.columns)
        if missing:
            raise KeyError(f"Missing required columns: {missing}")

        with Timer() as t:
            base = self._canonicalize(df)
            feats = self._compute_indicators(base)

            # QC
            cleaned, qc_metrics = clean_and_score(
                feats, iqr_k=self.config.iqr_k, ffill_limit=self.config.ffill_limit
            )
            # (در صورت نیاز می‌توان qc_metrics را log کرد)
            _ = qc_metrics  # silence linters if unused

            res = pd.concat([base[["symbol", "timeframe", "ts_event"]], cleaned], axis=1)
            feature_cols = [c for c in res.columns if c not in {"symbol", "timeframe", "ts_event"}]
            res["feature_hash"] = res.apply(lambda r: self._row_hash(r, feature_cols), axis=1)

            # validate schema row-by-row (بدون وابستگی لایه‌ای)
            for _, r in res.iterrows():
                payload = {
                    "symbol": r["symbol"],
                    "tf": r["timeframe"],
                    "timestamp": int(pd.to_datetime(r["ts_event"]).timestamp() * 1000),
                    "indicators": {c: r[c] for c in feature_cols},
                }
                _ensure_schema(FEATURE_SCHEMA_NAME, FEATURE_SCHEMA_V, payload)

            observe_feature_latency(t.dt_ms)
            return res
