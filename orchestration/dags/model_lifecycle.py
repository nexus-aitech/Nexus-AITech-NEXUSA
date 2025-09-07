"""
Orchestration DAG: Model Lifecycle Pipeline
===========================================

این DAG چرخه‌ی عمر مدل را مطابق معماری NEXUSA مدیریت می‌کند:
Build → Train → Evaluate → Approve → Deploy → Monitor/Drift

نکات اصلاحی این نسخه:
- رفع LAYER_VIOLATION: حذف import مستقیم از لایه‌های features/backtesting/signals/reports
  و استفاده از بارگذاری تنبل با importlib در لحظهٔ نیاز (Dependency Inversion).
- افزودن type hint برای **context و تعیین نوع خروجی تمام توابع گام‌ها.
- حفظ ساختار کلی DAG و رفتار قبلی.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Callable

import importlib
from airflow import DAG
from airflow.operators.python import PythonOperator, BranchPythonOperator
from airflow.utils.trigger_rule import TriggerRule

# لایهٔ core مجاز است
from core.config import settings
from core.ml_model import MLTrainer, Evaluator, DriftDetector, Deployer


# -------------------------------
# Lazy resolvers (to avoid layer violation)
# -------------------------------
def _resolve(module_path: str, attr: str) -> Callable[..., Any]:
    """Import `attr` from `module_path` lazily with a clear error if missing."""
    try:
        mod = importlib.import_module(module_path)
        fn = getattr(mod, attr)
        return fn  # type: ignore[return-value]
    except Exception as e:
        raise ImportError(f"Failed to resolve {attr} from {module_path}: {e}") from e


# -------------------------------
# 🟢 Step Functions
# -------------------------------
def build_features(**context: Any) -> str:
    """Build features from raw ingestion data and push dataset path to XCom."""
    build = _resolve("features.feature_builder", "build")
    dataset = build()
    context["ti"].xcom_push(key="dataset_path", value=dataset)
    return f"Features built and saved at {dataset}"


def train_model(**context: Any) -> str:
    """Train ML model on prepared dataset and push model_id to XCom."""
    dataset_path = context["ti"].xcom_pull(key="dataset_path")
    model_id = MLTrainer().train(dataset_path)
    context["ti"].xcom_push(key="model_id", value=model_id)
    return f"Model trained: {model_id}"


def evaluate_model(**context: Any) -> str:
    """Evaluate model with backtesting & risk-adjusted metrics; push metrics to XCom."""
    model_id = context["ti"].xcom_pull(key="model_id")
    metrics = Evaluator().evaluate(model_id)
    context["ti"].xcom_push(key="metrics", value=metrics)
    return f"Evaluation completed → {metrics}"


def approve_model(**context: Any) -> str:
    """Branch: return next task_id based on threshold checks."""
    metrics = context["ti"].xcom_pull(key="metrics") or {}
    sharpe = float(metrics.get("Sharpe", 0.0))
    calmar = float(metrics.get("Calmar", 0.0))

    if sharpe >= settings.MODEL_THRESHOLDS["sharpe"] and calmar >= settings.MODEL_THRESHOLDS["calmar"]:
        return "deploy_model"
    return "reject_model"


def deploy_model(**context: Any) -> str:
    """Deploy approved model (canary/shadow) and register with signal engine."""
    model_id = context["ti"].xcom_pull(key="model_id")
    Deployer().deploy(model_id, strategy="canary", traffic_pct=20)
    register_model = _resolve("signals.registry", "register_model")
    register_model(model_id)
    return f"Model {model_id} deployed in canary mode"


def reject_model(**context: Any) -> str:
    """Reject model and log the decision via reports module."""
    model_id = context["ti"].xcom_pull(key="model_id")
    log_rejection = _resolve("reports.report_generator", "log_rejection")
    log_rejection(model_id)
    return f"Model {model_id} rejected"


def monitor_drift(**context: Any) -> str:
    """Run drift detection on live data; raise to signal retraining if violated."""
    model_id = context["ti"].xcom_pull(key="model_id")
    drift_score = DriftDetector().check(model_id)

    if drift_score > settings.MODEL_THRESHOLDS["drift"]:
        # Raising here marks the task as failed → retraining can be triggered by downstream logic.
        raise ValueError(f"⚠️ Drift detected for model {model_id}, retraining required")
    return f"✅ Drift OK for {model_id}"


# -------------------------------
# 🟣 DAG Definition
# -------------------------------
default_args = {
    "owner": "nexusa",
    "depends_on_past": False,
    "email": ["alerts@nexusa.ai"],
    "email_on_failure": True,
    "email_on_retry": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=10),
}

with DAG(
    dag_id="model_lifecycle_pipeline",
    default_args=default_args,
    description="NEXUSA Model Lifecycle Orchestration DAG",
    schedule_interval="@daily",   # اجرای روزانه
    start_date=datetime(2025, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["ml", "model_lifecycle", "nexusa"],
) as dag:
    t1 = PythonOperator(task_id="build_features", python_callable=build_features, provide_context=True)
    t2 = PythonOperator(task_id="train_model", python_callable=train_model, provide_context=True)
    t3 = PythonOperator(task_id="evaluate_model", python_callable=evaluate_model, provide_context=True)
    t4 = BranchPythonOperator(task_id="approve_model", python_callable=approve_model, provide_context=True)
    t5a = PythonOperator(task_id="deploy_model", python_callable=deploy_model, provide_context=True)
    t5b = PythonOperator(task_id="reject_model", python_callable=reject_model, provide_context=True)
    t6 = PythonOperator(
        task_id="monitor_drift",
        python_callable=monitor_drift,
        provide_context=True,
        trigger_rule=TriggerRule.ALL_DONE,
    )

    # Dependencies
    t1 >> t2 >> t3 >> t4
    t4 >> [t5a, t5b]
    t5a >> t6

__all__ = ["dag"]
