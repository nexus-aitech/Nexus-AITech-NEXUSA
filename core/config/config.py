"""
NEXUSA core.config.config  — secure, fail-fast settings

- No insecure defaults for secrets.
- Reads from environment/.env and fails at startup if required vars are missing.
- Disallows known-bad placeholders (e.g., 'minioadmin', empty passwords).
"""

from __future__ import annotations

import os
import yaml
from functools import lru_cache
from typing import Optional, Literal
from pydantic import BaseModel, Field, ValidationError, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

# مسیر پیش‌فرض: دو پوشه بالاتر (ریشه پروژه) + config.yaml
DEFAULT_CFG = Path(__file__).resolve().parents[2] / "config.yaml"

# اگر env ست شده، همونو بگیر؛ وگرنه پیش‌فرض
CONFIG_PATH = os.getenv("CONFIG_PATH", str(DEFAULT_CFG))

with open(CONFIG_PATH, "r") as f:
    ...

# ---------- Sub-configs ----------

class KafkaCfg(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_prefix="KAFKA_")
    bootstrap: str = Field(..., description="Kafka bootstrap servers, e.g. kafka:9092")
    topic_ohlcv_raw: str = Field(default="ohlcv_raw")
    topic_ticks_raw: str = Field(default="ticks_raw")
    topic_features: str = Field(default="features")
    topic_signals: str = Field(default="signals")
    topic_dlq: str = Field(default="dlq")

class ClickHouseCfg(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        env_prefix="CLICKHOUSE_",
    )

    host: str
    port: int = 9000
    user: str = "default"
    password: str
    db: str = "nexusa"

    @model_validator(mode="after")
    def _no_empty_password(self) -> "ClickHouseCfg":
        if not self.password.strip():
            raise ValueError("CLICKHOUSE_PASSWORD must be set and non-empty.")
        return self

class S3Cfg(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_prefix="S3_")
    endpoint: str = Field(..., description="S3/MinIO endpoint, e.g. http://minio:9000")
    bucket: str = Field(..., description="Default bucket")
    access_key: str = Field(..., description="S3 access key (no insecure default)")
    secret_key: str = Field(..., description="S3 secret key (no insecure default)")
    region: Optional[str] = Field(default=None)

    @model_validator(mode="after")
    def _reject_insecure_minio_defaults(self) -> "S3Cfg":
        bad = ("minioadmin", "MINIO_MINIOADMIN")
        if self.access_key in bad or self.secret_key in bad:
            raise ValueError("S3_ACCESS_KEY/SECRET_KEY must not be 'minioadmin'.")
        return self


class RedisCfg(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_prefix="REDIS_")
    url: str = Field(..., description="Redis URL, e.g. redis://redis:6379/0")


# ---------- Top-level settings ----------

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", protected_namespaces=())

    # به‌جای str اجباری، مقدار پیش‌فرض و دامنه مجاز بده:
    env: Literal["dev", "staging", "prod"] = Field(default="prod", description="Deployment env")

    region: str = Field(default="eu-north-1")

    kafka: KafkaCfg = Field(default_factory=KafkaCfg)
    clickhouse: ClickHouseCfg = Field(default_factory=ClickHouseCfg)
    s3: S3Cfg = Field(default_factory=S3Cfg)
    redis: RedisCfg = Field(default_factory=RedisCfg)

    @model_validator(mode="after")
    def _validate_env(self) -> "Settings":
        # ایمن در برابر نبودن فیلد
        allowed = {"dev", "staging", "prod"}
        val = getattr(self, "env", None)
        if val not in allowed:
            raise ValueError(f"ENV must be one of {sorted(allowed)}.")
        return self

@lru_cache()
def get_settings() -> Settings:
    return Settings()


# Eager singleton (common import pattern)
try:
    settings = get_settings()
except ValidationError as e:
    # Fail-fast with a clear, aggregated error message
    # (FastAPI/Uvicorn will print this and exit non-zero)
    raise SystemExit(f"[CONFIG ERROR] {e}")  # noqa: TRY003
