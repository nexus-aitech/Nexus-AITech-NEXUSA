# signals/registry.py
# -*- coding: utf-8 -*-
"""
Model Registry for NEXUSA
-------------------------
- ثبت مدل‌های deploy شده (canary/production) با متادیتا
- atomic write برای جلوگیری از خرابی رجیستری
- history + events برای ردیابی کامل
- API ساده برای استفاده در DAG: register_model(model_id)

ساختار فایل رجیستری (JSON):
{
  "active": {"model_id": "...", "stage": "canary|production", "traffic_pct": 20},
  "models": {
    "model_1234": {"stage": "canary", "traffic_pct": 20, "created_at": "...", "meta": {...}}
  },
  "history": [
    {"ts":"...", "event":"register", "model_id":"model_1234", "details": {...}}
  ]
}
"""

from __future__ import annotations
from typing import Optional, Dict, Any
import json
import os
import uuid
from datetime import datetime, timezone
import logging
import time

# ----------------------------
# Logging
# ----------------------------
logger = logging.getLogger("nexusa.registry")
if not logger.handlers:
    logger.setLevel(logging.INFO)
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s - %(message)s"))
    logger.addHandler(_h)

REGISTRY_DIR = "artifacts"
REGISTRY_FILE = os.path.join(REGISTRY_DIR, "model_registry.json")
EVENTS_FILE = os.path.join(REGISTRY_DIR, "model_events.jsonl")

# ----------------------------
# Observability (Prometheus) - optional
# ----------------------------
try:
    from prometheus_client import Counter, Histogram  # type: ignore
except Exception:  # pragma: no cover
    Counter = None  # type: ignore
    Histogram = None  # type: ignore

_REGISTRY_READ_SECONDS = (
    Histogram("nexusa_registry_read_seconds", "Latency of reading the registry (seconds).")
    if Histogram else None
)
_REGISTRY_WRITE_SECONDS = (
    Histogram("nexusa_registry_write_seconds", "Latency of atomic writes to registry (seconds).")
    if Histogram else None
)
_EVENT_APPEND_SECONDS = (
    Histogram("nexusa_registry_event_append_seconds", "Latency of appending a registry event (seconds).")
    if Histogram else None
)
_REGISTER_COUNT = (
    Counter("nexusa_registry_register_total", "Total register() calls.")
    if Counter else None
)
_SET_ACTIVE_COUNT = (
    Counter("nexusa_registry_set_active_total", "Total set_active() calls.")
    if Counter else None
)
_PROMOTE_COUNT = (
    Counter("nexusa_registry_promote_total", "Total promote_to_production() calls.")
    if Counter else None
)
_ROLLBACK_COUNT = (
    Counter("nexusa_registry_rollback_total", "Total rollback() calls.")
    if Counter else None
)

# ----------------------------
# Utilities
# ----------------------------
def _utc_now_iso() -> str:
    """UTC now به صورت ISO8601 (شامل offset) برمی‌گرداند."""
    return datetime.now(timezone.utc).isoformat()

def _ensure_dirs() -> None:
    """پوشه artifacts را در صورت نبود می‌سازد (idempotent)."""
    os.makedirs(REGISTRY_DIR, exist_ok=True)

def _read_registry() -> Dict[str, Any]:
    """خواندن فایل رجیستری از دیسک؛ در صورت خرابی JSON، نسخه جدید خالی ساخته می‌شود."""
    _ensure_dirs()
    t0 = time.time()
    try:
        if not os.path.exists(REGISTRY_FILE):
            return {"active": None, "models": {}, "history": []}
        with open(REGISTRY_FILE, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                logger.error("Registry JSON corrupted; starting fresh (backup created).")
                _backup = REGISTRY_FILE + f".bak_{uuid.uuid4().hex[:6]}"
                os.replace(REGISTRY_FILE, _backup)
                return {"active": None, "models": {}, "history": []}
    finally:
        if _REGISTRY_READ_SECONDS:
            try:
                _REGISTRY_READ_SECONDS.observe(time.time() - t0)
            except Exception:
                pass

def _atomic_write(path: str, data: str) -> None:
    """نوشتن اتمیک روی فایل مقصد با استفاده از فایل موقت و os.replace."""
    t0 = time.time()
    tmp = f"{path}.tmp_{uuid.uuid4().hex[:6]}"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(data)
    os.replace(tmp, path)
    if _REGISTRY_WRITE_SECONDS:
        try:
            _REGISTRY_WRITE_SECONDS.observe(time.time() - t0)
        except Exception:
            pass

def _append_event(event: Dict[str, Any]) -> None:
    """افزودن یک رویداد به فایل JSONL مربوط به رویدادهای رجیستری."""
    _ensure_dirs()
    t0 = time.time()
    with open(EVENTS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")
    if _EVENT_APPEND_SECONDS:
        try:
            _EVENT_APPEND_SECONDS.observe(time.time() - t0)
        except Exception:
            pass

def _artifact_exists(model_id: str) -> bool:
    """بررسی وجود artifact مدل با نام <model_id>.pkl در پوشه artifacts."""
    model_path = os.path.join(REGISTRY_DIR, f"{model_id}.pkl")
    return os.path.exists(model_path)

# ----------------------------
# Model Registry (OO API)
# ----------------------------
class ModelRegistry:
    """API سطح‌بالا برای ثبت، فعال‌سازی، ترفیع و پرس‌وجوی وضعیت مدل‌ها در رجیستری."""

    def __init__(self) -> None:
        """راه‌اندازی رجیستری و اطمینان از وجود مسیرهای لازم."""
        _ensure_dirs()

    # Core operations
    def register(self, model_id: str, stage: str = "canary", traffic_pct: int = 20,
                 meta: Optional[Dict[str, Any]] = None) -> bool:
        """
        ثبت مدل جدید در رجیستری. اگر artifact مدل موجود نباشد، خطا می‌دهد.

        Args:
            model_id: شناسه مدل (نام artifact بدون پسوند).
            stage: مرحله استقرار ("canary" یا "production").
            traffic_pct: درصد ترافیک تخصیص‌یافته.
            meta: متادیتای اختیاری.

        Returns:
            True در صورت موفقیت.
        """
        if not _artifact_exists(model_id):
            raise FileNotFoundError(f"Artifact not found: {REGISTRY_DIR}/{model_id}.pkl")

        reg = _read_registry()
        ts = _utc_now_iso()
        entry = {
            "stage": stage,
            "traffic_pct": int(traffic_pct),
            "created_at": ts,
            "meta": meta or {},
        }
        reg["models"][model_id] = entry
        # اگر active خالی باشد، همین را active کن
        if reg.get("active") is None:
            reg["active"] = {"model_id": model_id, "stage": stage, "traffic_pct": int(traffic_pct)}
        reg["history"].append({"ts": ts, "event": "register", "model_id": model_id, "details": entry})

        _atomic_write(REGISTRY_FILE, json.dumps(reg, ensure_ascii=False, indent=2))
        _append_event({"ts": ts, "event": "register", "model_id": model_id, "details": entry})
        if _REGISTER_COUNT:
            try:
                _REGISTER_COUNT.inc()
            except Exception:
                pass
        logger.info("Model %s registered (%s, %d%%).", model_id, stage, traffic_pct)
        return True

    def set_active(self, model_id: str, stage: Optional[str] = None, traffic_pct: Optional[int] = None) -> bool:
        """
        تعیین مدل فعال فعلی.

        Args:
            model_id: شناسه مدل هدف.
            stage: مرحله (در صورت None از مقدار مدل در رجیستری استفاده می‌شود).
            traffic_pct: درصد ترافیک (در صورت None از مقدار مدل در رجیستری استفاده می‌شود).

        Returns:
            True در صورت موفقیت.
        """
        reg = _read_registry()
        if model_id not in reg["models"]:
            raise KeyError(f"Unknown model_id: {model_id}")
        if stage is None:
            stage = reg["models"][model_id]["stage"]
        if traffic_pct is None:
            traffic_pct = reg["models"][model_id]["traffic_pct"]
        reg["active"] = {"model_id": model_id, "stage": stage, "traffic_pct": int(traffic_pct)}
        ts = _utc_now_iso()
        reg["history"].append({"ts": ts, "event": "set_active", "model_id": model_id,
                               "details": reg["active"]})
        _atomic_write(REGISTRY_FILE, json.dumps(reg, ensure_ascii=False, indent=2))
        _append_event({"ts": ts, "event": "set_active", "model_id": model_id, "details": reg["active"]})
        if _SET_ACTIVE_COUNT:
            try:
                _SET_ACTIVE_COUNT.inc()
            except Exception:
                pass
        logger.info("Active model set to %s (%s, %d%%).", model_id, stage, traffic_pct)
        return True

    def promote_to_production(self, model_id: str, traffic_pct: int = 100) -> bool:
        """
        ترفیع مدل به مرحله production و تنظیم ترافیک.

        Args:
            model_id: شناسه مدل.
            traffic_pct: درصد ترافیک تخصیص‌یافته در production.

        Returns:
            True در صورت موفقیت.
        """
        reg = _read_registry()
        if model_id not in reg["models"]:
            raise KeyError(f"Unknown model_id: {model_id}")
        reg["models"][model_id]["stage"] = "production"
        reg["models"][model_id]["traffic_pct"] = int(traffic_pct)
        ts = _utc_now_iso()
        reg["history"].append({"ts": ts, "event": "promote", "model_id": model_id,
                               "details": {"stage": "production", "traffic_pct": int(traffic_pct)}})
        # active هم به‌روز شود
        reg["active"] = {"model_id": model_id, "stage": "production", "traffic_pct": int(traffic_pct)}
        _atomic_write(REGISTRY_FILE, json.dumps(reg, ensure_ascii=False, indent=2))
        _append_event({"ts": ts, "event": "promote", "model_id": model_id,
                       "details": {"stage": "production", "traffic_pct": int(traffic_pct)}})
        if _PROMOTE_COUNT:
            try:
                _PROMOTE_COUNT.inc()
            except Exception:
                pass
        logger.info("Model %s promoted to production (%d%%).", model_id, traffic_pct)
        return True

    def rollback(self) -> Optional[str]:
        """
        بازگشت به مدل قبلی در history (آخرین مدل production قبل از فعلی).

        Returns:
            model_id مدل برگشتی در صورت موفقیت، وگرنه None.
        """
        reg = _read_registry()
        active = reg.get("active")
        if not active:
            logger.warning("No active model to rollback from.")
            return None

        # جستجوی آخرین promote قبلی
        hist = reg.get("history", [])
        prev_prod = None
        for ev in reversed(hist):
            if ev["event"] == "promote" and ev["model_id"] != active["model_id"]:
                prev_prod = ev["model_id"]
                break
        if prev_prod is None:
            logger.warning("No previous production model found in history.")
            return None

        self.set_active(prev_prod, stage="production", traffic_pct=100)
        if _ROLLBACK_COUNT:
            try:
                _ROLLBACK_COUNT.inc()
            except Exception:
                pass
        logger.info("Rolled back to previous production model %s.", prev_prod)
        return prev_prod

    # Queries
    def get_active(self) -> Optional[Dict[str, Any]]:
        """وضعیت مدل فعال فعلی را برمی‌گرداند (model_id/stage/traffic_pct) یا None."""
        return _read_registry().get("active")

    def list_models(self) -> Dict[str, Any]:
        """لیست کامل مدل‌های رجیستری‌شده را برمی‌گرداند (دیکشنری model_id -> entry)."""
        return _read_registry().get("models", {})

# ----------------------------
# Simple functional facade (for DAG import)
# ----------------------------
def register_model(model_id: str, stage: str = "canary", traffic_pct: int = 20,
                   meta: Optional[Dict[str, Any]] = None) -> bool:
    """
    رابط ساده‌ای که DAG از آن استفاده می‌کند.
    """
    reg = ModelRegistry()
    return reg.register(model_id, stage=stage, traffic_pct=traffic_pct, meta=meta)

__all__ = ["ModelRegistry", "register_model"]
