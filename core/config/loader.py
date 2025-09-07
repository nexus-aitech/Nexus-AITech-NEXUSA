"""NEXUSA core.config.loader

Config loader utilities:
- Defines pydantic models for application configuration (Redis/Storage/Registry/Ingestion/App).
- Loads JSON/YAML from a given path (or env var NEXUSA_CONFIG_PATH), with robust UTF-8 handling.
- Validates against models and returns a typed AppConfig.
- Uses logging (not print) for diagnostics and debug dumps.
"""

# Module implemented per architecture; see README for usage.
import os
import json
import logging
from pprint import pformat
from pathlib import Path
from typing import Any, Dict, Optional

import yaml  # Requires PyYAML
from pydantic import BaseModel, ValidationError
from core.config.models import AppConfig  # If your models live elsewhere, adjust import

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
# Loaders
# ========================

def _load_from_json(path: Path) -> Dict[str, Any]:
    """Load a JSON file as a dict using UTF-8 encoding."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_from_yaml(path: Path) -> Dict[str, Any]:
    """Load a YAML file as a dict, trying UTF-8 then UTF-8 with BOM fallback."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except UnicodeDecodeError:
        with open(path, "r", encoding="utf-8-sig") as f:
            return yaml.safe_load(f)


def _detect_file_type_and_load(path: Path) -> Dict[str, Any]:
    """Detect file type by suffix and dispatch to the appropriate loader."""
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    if path.suffix == ".json":
        return _load_from_json(path)
    if path.suffix in (".yaml", ".yml"):
        return _load_from_yaml(path)
    raise ValueError(f"Unsupported config file type: {path.suffix}")


# ========================
# Main Loader Function
# ========================

def load_config(config_path: Optional[str] = None) -> AppConfig:
    """
    Load and validate application configuration.

    Args:
        config_path: Optional path to a JSON/YAML config file. If not provided,
                     falls back to env var `NEXUSA_CONFIG_PATH` or `config.yaml`.

    Returns:
        AppConfig: Parsed and validated configuration object.

    Raises:
        FileNotFoundError: If the config path does not exist.
        ValueError: If the file type is unsupported.
        ValidationError: If the loaded config does not match the schema.
    """
    # Default: config.yaml next to the working directory unless overridden
    config_path = config_path or os.environ.get("NEXUSA_CONFIG_PATH", "config.yaml")
    path = Path(config_path).expanduser().resolve()

    raw_config = _detect_file_type_and_load(path)  # must return a dict

    try:
        cfg = AppConfig(**raw_config)
    except ValidationError as e:
        log.error("Invalid configuration format at %s", path)
        try:
            log.error("Validation details:\n%s", e.json(indent=2))
        except TypeError:
            log.error("Validation details:\n%s", e.json())
        raise

    if getattr(cfg, "debug", False):
        # v2: model_dump / v1: dict
        dump = cfg.model_dump() if hasattr(cfg, "model_dump") else cfg.dict()
        log.info("Config loaded from %s", path)
        log.debug("AppConfig dump:\n%s", pformat(dump, indent=2))

    return cfg
