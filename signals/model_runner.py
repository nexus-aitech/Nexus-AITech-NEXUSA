from __future__ import annotations
"""
model_runner
------------
Loads an ML model (sklearn/ONNX), prepares features, and provides TP probabilities/predictions.
Adds lightweight Prometheus metrics on critical paths (load & inference).
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
import json
import numpy as np
import pandas as pd
import time

try:
    # Optional: if prometheus_client is unavailable, metrics become no-ops
    from prometheus_client import Counter, Histogram  # type: ignore
except Exception:  # pragma: no cover
    Counter = None  # type: ignore
    Histogram = None  # type: ignore

# -------- Observability (Prometheus) --------
_MODEL_LOAD_COUNT = (
    Counter("model_runner_model_load_total",
            "Total number of model loads.", ["model_type"])
    if Counter else None
)
_MODEL_LOAD_SECONDS = (
    Histogram("model_runner_model_load_seconds",
              "Latency of model loading in seconds.")
    if Histogram else None
)
_PREDICT_COUNT = (
    Counter("model_runner_predict_requests_total",
            "Total number of predict_proba requests.", ["model_type"])
    if Counter else None
)
_PREDICT_SECONDS = (
    Histogram("model_runner_predict_proba_seconds",
              "Latency of predict_proba in seconds.")
    if Histogram else None
)


@dataclass
class ModelRunnerConfig:
    """پیکربندی اجرای مدل.

    Attributes:
        model_path: مسیر فایل مدل.
        model_type: نوع مدل: "sklearn" یا "onnx".
        feature_order: ترتیب ستون‌های ورودی در صورت نیاز.
        calibrator_path: مسیر کالیبریتر (اختیاری).
        proba_key: ایندکس کلاس مثبت برای خروجی proba.
        threshold: آستانه برش برای خروجی دودویی.
        meta_path: مسیر فایل متادیتا (اختیاری).
    """
    model_path: str
    model_type: str = "sklearn"  # or "onnx"
    feature_order: Optional[List[str]] = None
    calibrator_path: Optional[str] = None   # optional sklearn CalibratedClassifier or Platt/Isotonic model
    proba_key: int = 1  # index for positive class probability if needed
    threshold: float = 0.5
    meta_path: Optional[str] = None         # optional json with feature_order etc.


class ModelRunner:
    """
    Loads an ML model and outputs probability of Take-Profit (TP).
    Supports optional calibration.
    """
    def __init__(self, cfg: ModelRunnerConfig) -> None:
        """سازنده کلاس: کانفیگ را ذخیره و مدل/کالیبریتر را بارگذاری می‌کند."""
        self.cfg = cfg
        self.model = None
        self.calibrator = None
        self.meta: Dict[str, Any] = {}
        self._load()

    def _load(self) -> None:
        """بارگذاری متادیتا، مدل (sklearn/onnx) و کالیبریتر (اختیاری)."""
        _t0 = time.time()
        model_type_lbl = (self.cfg.model_type or "sklearn").lower()
        # read metadata if provided
        if self.cfg.meta_path:
            try:
                with open(self.cfg.meta_path, "r", encoding="utf-8") as f:
                    self.meta = json.load(f)
                if not self.cfg.feature_order and "feature_order" in self.meta:
                    self.cfg.feature_order = list(self.meta["feature_order"])
            except Exception:
                self.meta = {}

        if self.cfg.model_type.lower() == "sklearn":
            import joblib
            self.model = joblib.load(self.cfg.model_path)
            if self.cfg.calibrator_path:
                try:
                    self.calibrator = joblib.load(self.cfg.calibrator_path)
                except Exception:
                    self.calibrator = None
        elif self.cfg.model_type.lower() == "onnx":
            try:
                import onnxruntime as ort
            except Exception as e:
                raise RuntimeError("onnxruntime is required for ONNX models") from e
            self.session = ort.InferenceSession(self.cfg.model_path, providers=["CPUExecutionProvider"])
            self.model = "onnx"
        else:
            raise ValueError(f"Unsupported model_type: {self.cfg.model_type}")
        # metrics
        if _MODEL_LOAD_COUNT:
            try:
                _MODEL_LOAD_COUNT.labels(model_type=model_type_lbl).inc()
            except Exception:
                pass
        if _MODEL_LOAD_SECONDS:
            try:
                _MODEL_LOAD_SECONDS.observe(time.time() - _t0)
            except Exception:
                pass

    def _select_and_order(self, X: pd.DataFrame) -> np.ndarray:
        """انتخاب و مرتب‌سازی ویژگی‌ها مطابق feature_order یا انتخاب عددی‌ها."""
        if self.cfg.feature_order:
            cols = [c for c in self.cfg.feature_order if c in X.columns]
            arr = X[cols].to_numpy(dtype=float, copy=False)
        else:
            arr = X.select_dtypes(include=[np.number]).to_numpy(dtype=float, copy=False)
        return arr

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """محاسبه احتمال TP برای هر ردیف ورودی؛ شامل کالیبراسیون اختیاری."""
        _t0 = time.time()
        arr = self._select_and_order(X)
        if self.cfg.model_type.lower() == "sklearn":
            if hasattr(self.model, "predict_proba"):
                proba = self.model.predict_proba(arr)
                p = proba[:, self.cfg.proba_key]
            elif hasattr(self.model, "decision_function"):
                # convert scores to probabilities via logistic
                scores = self.model.decision_function(arr)
                p = 1.0 / (1.0 + np.exp(-scores))
            else:
                # fallback: predict outputs logits
                pred = self.model.predict(arr)
                p = np.clip(pred.astype(float), 0.0, 1.0)
        else:  # onnx
            input_name = self.session.get_inputs()[0].name
            pred = self.session.run(None, {input_name: arr.astype(np.float32)})
            # assume the first output is probability vector
            out = pred[0]
            if out.ndim == 2:
                p = out[:, self.cfg.proba_key]
            else:
                p = out.astype(np.float64).ravel()

        if self.calibrator is not None:
            if hasattr(self.calibrator, "predict_proba"):
                p = self.calibrator.predict_proba(p.reshape(-1, 1))[:, -1]
            else:
                # Platt scaling: calibrator returns (a,b) for sigmoid 1/(1+exp(a*x+b))
                try:
                    a, b = self.calibrator  # type: ignore
                    p = 1.0 / (1.0 + np.exp(a * p + b))
                except Exception:
                    pass
        # metrics
        if _PREDICT_COUNT:
            try:
                _PREDICT_COUNT.labels(model_type=self.cfg.model_type.lower()).inc()
            except Exception:
                pass
        if _PREDICT_SECONDS:
            try:
                _PREDICT_SECONDS.observe(time.time() - _t0)
            except Exception:
                pass
        return p

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """تبدیل احتمال TP به برچسب دودویی بر اساس threshold."""
        p = self.predict_proba(X)
        return (p >= self.cfg.threshold).astype(int)
