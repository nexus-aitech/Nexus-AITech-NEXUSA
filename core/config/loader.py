"""
NEXUSA core.config.loader

- تعریف اسکیمای پیکربندی با Pydantic (v2).
- لود YAML/JSON با جایگزینی ${ENV_VAR} از os.environ (و .env اگر زودتر load شده باشد).
- هندلینگ UTF-8 و UTF-8 with BOM.
- خطاها با logging گزارش می‌شوند؛ ValidationError عیناً بالا پرتاب می‌شود.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from pprint import pformat
from typing import Any, Dict, Optional
from core.config.models import AppConfig

import yaml
from pydantic import BaseModel, ValidationError

log = logging.getLogger(__name__)

# ========================
# Config Schema Definition
# ========================

class RedisConfig(BaseModel):
    """Redis connection parameters."""
    host: str
    port: int
    db: int = 0


class StorageConfig(BaseModel):
    """Storage layer settings including TSDB, S3 bucket, and Redis nested config."""
    tsdb_url: str
    s3_bucket: str
    redis: RedisConfig


class ModelRegistryConfig(BaseModel):
    """Model registry backend configuration (e.g., MLflow URIs, artifact store)."""
    provider: str
    tracking_uri: str
    artifact_store: str


class IngestionConfig(BaseModel):
    """Ingestion pipeline configuration: sources, methods, and retry policy."""
    exchanges: list[str]
    methods: list[str]
    retry_policy: Dict[str, Any]


class AppConfig(BaseModel):
    """Top-level application configuration."""
    env: str
    debug: bool = False
    ingestion: IngestionConfig
    storage: StorageConfig
    model_registry: Optional[ModelRegistryConfig] = None


# ========================
# Helpers
# ========================

_ENV_PATTERN = re.compile(r"\$\{([^}]+)\}")

def _sub_env_vars(text: str) -> str:
    """
    ${VAR} را با مقدار os.environ['VAR'] جایگزین می‌کند؛
    اگر تعریف نشده باشد، همان ${VAR} را نگه می‌دارد (تا خطای اعتبارسنجی مشخص بدهد).
    """
    return _ENV_PATTERN.sub(lambda m: os.getenv(m.group(1), m.group(0)), text)


def _load_from_json(path: Path) -> Dict[str, Any]:
    """Load a JSON file as a dict using UTF-8 encoding."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_from_yaml(path: Path) -> Dict[str, Any]:
    """
    Load a YAML file as a dict.
    - ابتدا فایل را به صورت متن می‌خوانیم،
    - سپس ${VAR} را از env جایگزین می‌کنیم،
    - بعد safe_load می‌کنیم.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
    except UnicodeDecodeError:
        with open(path, "r", encoding="utf-8-sig") as f:
            text = f.read()

    text = _sub_env_vars(text)
    return yaml.safe_load(text)


def _detect_file_type_and_load(path: Path) -> Dict[str, Any]:
    """Detect file type by suffix and dispatch to the appropriate loader."""
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    suffix = path.suffix.lower()
    if suffix == ".json":
        return _load_from_json(path)
    if suffix in (".yaml", ".yml"):
        return _load_from_yaml(path)

    raise ValueError(f"Unsupported config file type: {path.suffix}")


# ========================
# Main Loader Function
# ========================

def load_config(config_path: Optional[str] = None) -> AppConfig:
    """
    Load and validate application configuration.

    Args:
        config_path: مسیر اختیاری فایل YAML/JSON. اگر ندهید:
                     1) از env: NEXUSA_CONFIG_PATH
                     2) پیش‌فرض: ./config.yaml

    Returns:
        AppConfig (typed)

    Raises:
        FileNotFoundError / ValueError / ValidationError
    """
    config_path = config_path or os.environ.get("NEXUSA_CONFIG_PATH", "config.yaml")
    path = Path(config_path).expanduser().resolve()

    raw_config = _detect_file_type_and_load(path)

    try:
        cfg = AppConfig(**raw_config)
    except ValidationError as e:
        log.error("Invalid configuration format at %s", path)
        # لاگِ جزئیات اعتبارسنجی به صورت JSON مرتب
        try:
            log.error("Validation details:\n%s", e.json(indent=2))
        except TypeError:
            log.error("Validation details:\n%s", e.json())
        raise

    # اگر حالت debug روشن است، دامپ کانفیگ را در سطح DEBUG لاگ کن
    if getattr(cfg, "debug", False):
        dump = cfg.model_dump() if hasattr(cfg, "model_dump") else cfg.dict()
        log.info("Config loaded from %s", path)
        log.debug("AppConfig dump:\n%s", pformat(dump, indent=2))

    return cfg
