"""NEXUSA core.config.models

Pydantic v1 models for application configuration. این ماژول تمام مدل‌های
کانفیگ موردنیاز پلتفرم را متمرکز می‌کند تا اعتبارسنجی و مستندسازی یکنواخت داشته باشیم.
"""

# Pydantic v1
from pydantic import BaseModel
from typing import List, Optional, Dict


class WSBackoff(BaseModel):
    """پارامترهای backoff برای اتصال‌های وب‌سوکت."""
    initial_sec: float = 1.0
    max_sec: float = 30.0
    factor: float = 1.8

    class Config:
        extra = "ignore"


class WSSection(BaseModel):
    """پیکربندی سطح وب‌سوکت برای ingestion زنده."""
    connect_timeout_sec: float = 10.0
    ping_interval_sec: float = 15.0
    pong_timeout_sec: float = 10.0
    max_retries: int = 0
    subscribe_batch_size: int = 20
    max_queue: int = 10000
    backoff: WSBackoff = WSBackoff()

    class Config:
        extra = "ignore"


class RetryPolicy(BaseModel):
    """سیاست retry عمومی برای فراخوانی‌های شبکه‌ای."""
    retries: int = 3
    backoff_sec: float = 2.0

    class Config:
        extra = "ignore"


class AccountsSection(BaseModel):
    """مشخصات حساب صرافی برای اتصال (اختیاری/محلی)."""
    enabled: bool = False
    apiKey: Optional[str] = None
    secret: Optional[str] = None

    class Config:
        extra = "ignore"


class IngestionAccounts(BaseModel):
    """مجموعه حساب‌های صرافی‌ها برای ingestion زنده/بک‌فیل.

    ساختار داینامیک: کلید = نام صرافی، مقدار = AccountsSection
    """
    exchanges: Dict[str, AccountsSection] = {}

    class Config:
        extra = "allow"   # اجازه بده صرافی‌های جدید هم اضافه بشن


class IngestionConfig(BaseModel):
    """پیکربندی ماژول ingestion."""
    mode: str = "live"                       # live | backfill
    methods: List[str] = ["websocket"]
    exchanges: List[str] = []
    symbols: List[str] = []                  # ← جدید
    timeframes: List[str] = []               # ← جدید
    streams: List[str] = []                  # ← جدید
    ws: Optional[WSSection] = None           # ← جدید
    retry_policy: RetryPolicy = RetryPolicy()
    ccxt: dict = {}
    accounts: Optional[IngestionAccounts] = None

    class Config:
        extra = "allow"   # ← کلیدهای آینده حذف نشوند


class PipelineConfig(BaseModel):
    """پیکربندی پایپ‌لاین سطح بالا (گام‌ها و حالت اجرا)."""
    steps: List[str] = ["ingestion", "features", "signals", "backtest"]
    mode: str = "live"
    input: Optional[str] = None

    class Config:
        extra = "ignore"


class StorageConfig(BaseModel):
    """پیکربندی لایه ذخیره‌سازی."""
    lake_root: Optional[str] = None
    tsdb_url: Optional[str] = None
    s3_bucket: Optional[str] = None
    redis: dict = {}

    class Config:
        extra = "ignore"


class ModelRegistry(BaseModel):
    """پیکربندی رجیستری مدل‌ها (مثلاً MLflow)."""
    provider: str = "mlflow"
    tracking_uri: Optional[str] = None
    artifact_store: Optional[str] = None

    class Config:
        extra = "ignore"


class AppConfig(BaseModel):
    """پیکربندی سطح برنامه که سایر بخش‌ها را تجمیع می‌کند."""
    env: str = "dev"
    debug: bool = True
    pipeline: Optional[PipelineConfig] = None
    ingestion: IngestionConfig = IngestionConfig()
    storage: StorageConfig = StorageConfig()
    model_registry: ModelRegistry = ModelRegistry()

    class Config:
        extra = "allow"   # ← کانفیگ‌های سفارشی را دور نریز
