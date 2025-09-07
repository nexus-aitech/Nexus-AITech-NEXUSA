from __future__ import annotations
"""
rationale_mapper
----------------
Maps feature attributions (SHAP or proxy) to a compact rationale payload with a stable ID.

Observability:
- Prometheus counters for explain calls (by method) and SHAP fallbacks.
- Prometheus histogram for end-to-end latency of `explain_row`.
"""

from dataclasses import dataclass
from typing import Dict, List, Any, Optional, Tuple
import hashlib
import numpy as np
import pandas as pd
import time

# Optional Prometheus metrics
try:
    from prometheus_client import Counter, Histogram  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    Counter = None  # type: ignore
    Histogram = None  # type: ignore

_EXPLAIN_COUNT = (
    Counter(
        "rationale_mapper_explain_total",
        "Total number of rationale explanations generated.",
        ["method"],  # shap | proxy
    )
    if Counter
    else None
)
_EXPLAIN_SECONDS = (
    Histogram(
        "rationale_mapper_explain_seconds",
        "Latency of explain_row in seconds.",
    )
    if Histogram
    else None
)
_SHAP_FALLBACK_COUNT = (
    Counter(
        "rationale_mapper_shap_fallback_total",
        "Number of times SHAP failed and proxy method was used.",
    )
    if Counter
    else None
)


@dataclass
class RationaleConfig:
    """تنظیمات تولید rationale.

    Attributes:
        top_k: تعداد ویژگی‌های برتر در خروجی.
        use_shap: در صورت موجود بودن SHAP از آن استفاده شود.
        normalize: نرمال‌سازی مقادیر به طوری که جمع قدرمطلق‌ها برابر 1 شود.
    """
    top_k: int = 5
    use_shap: bool = True
    normalize: bool = True


class RationaleMapper:
    """
    Attaches SHAP/feature attributions and maps to a rationale_id.
    If SHAP not available, falls back to simple contribution proxy.
    """

    def __init__(self, cfg: RationaleConfig) -> None:
        """سازنده: پیکربندی را ذخیره کرده و دسترسی به SHAP را تشخیص می‌دهد."""
        self.cfg = cfg
        try:
            import shap  # noqa: F401
            self._has_shap = True
        except Exception:
            self._has_shap = False

    def _proxy_contrib(self, model: Any, x_row: pd.Series) -> Dict[str, float]:
        """تخمین مشارکت ویژگی‌ها بدون SHAP.

        اولویت‌ها:
          1) مدل‌های خطی با coef_
          2) مدل‌های درختی با feature_importances_
          3) نرمال‌سازی Z-score برای سایر مدل‌ها

        Args:
            model: شیء مدل (sklearn-compatible).
            x_row: داده‌ی تک‌ردیفه به صورت Series (ویژگی‌ها به عنوان ایندکس).

        Returns:
            دیکشنری از نام ویژگی به مقدار مشارکت.
        """
        contrib: Dict[str, float] = {}
        if hasattr(model, "coef_"):
            coefs = np.ravel(model.coef_)
            features = x_row.index.tolist()
            for i, f in enumerate(features[: len(coefs)]):
                contrib[f] = float(coefs[i] * float(x_row[f]))
        elif hasattr(model, "feature_importances_"):
            imps = np.ravel(model.feature_importances_)
            features = x_row.index.tolist()
            for i, f in enumerate(features[: len(imps)]):
                contrib[f] = float(imps[i] * float(x_row[f]))
        else:
            # Default: z-score magnitude as importance
            z = (x_row - x_row.mean()) / (x_row.std(ddof=0) + 1e-12)
            for f in x_row.index:
                contrib[f] = float(abs(z[f]))
        return contrib

    def explain_row(self, model: Any, X_row: pd.Series) -> Dict[str, Any]:
        """تولید rationale برای یک ردیف داده با استفاده از SHAP یا روش جایگزین.

        Args:
            model: مدل آموزش‌دیده (sklearn/سایر).
            X_row: سری شامل ویژگی‌های یک ردیف (ایندکس‌ها نام ویژگی‌ها).

        Returns:
            Payload شامل:
              - "top_features": لیست زوج‌های (feature, contribution) مرتب‌شده بر حسب |value|
              - "rationale_id": شناسه پایدار 16 کاراکتری بر اساس hash از top_features
        """
        _t0 = time.time()
        method = "proxy"
        x = X_row.astype(float)

        if self.cfg.use_shap and self._has_shap:
            try:
                import shap
                if hasattr(model, "predict_proba"):
                    explainer = shap.Explainer(model, np.array([x.values]))
                else:
                    explainer = shap.Explainer(model)
                sv = explainer(np.array([x.values]))  # one row
                values = sv.values[0] if hasattr(sv, "values") else np.ravel(sv)[0]
                contrib = {f: float(values[i]) for i, f in enumerate(X_row.index)}
                method = "shap"
            except Exception:
                contrib = self._proxy_contrib(model, x)
                if _SHAP_FALLBACK_COUNT:
                    try:
                        _SHAP_FALLBACK_COUNT.inc()
                    except Exception:
                        pass
        else:
            contrib = self._proxy_contrib(model, x)

        # normalize to sum=1 for comparability
        if self.cfg.normalize:
            s = sum(abs(v) for v in contrib.values()) or 1.0
            contrib = {k: float(v / s) for k, v in contrib.items()}

        # top-k features
        top = sorted(contrib.items(), key=lambda kv: abs(kv[1]), reverse=True)[: self.cfg.top_k]
        rationale_payload = {"top_features": top}
        # stable rationale id
        rid = hashlib.sha256(str(top).encode("utf-8")).hexdigest()[:16]
        rationale_payload["rationale_id"] = rid

        # metrics
        if _EXPLAIN_COUNT:
            try:
                _EXPLAIN_COUNT.labels(method=method).inc()
            except Exception:
                pass
        if _EXPLAIN_SECONDS:
            try:
                _EXPLAIN_SECONDS.observe(time.time() - _t0)
            except Exception:
                pass

        return rationale_payload
