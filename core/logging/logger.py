"""
Structured logging utilities for NEXUSA.

This module provides:
- `JsonFormatter`: a JSON formatter suitable for machine-ingested logs.
- `get_logger`: a convenience function to configure a rotating file + console logger
  with either human-readable or JSON output, and level derived from env when not provided.
"""

import os
import sys
import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional


class JsonFormatter(logging.Formatter):
    """
    A logging formatter that serializes log records into a single-line JSON object.

    Fields included:
        timestamp, level, logger, message, file, line, function, and exception (when present).
    """

    def format(self, record: logging.LogRecord) -> str:
        """
        Format a `LogRecord` into a JSON string.

        Args:
            record: The log record to be formatted.

        Returns:
            A JSON-encoded string containing the standardized log fields.
        """
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "file": record.pathname,
            "line": record.lineno,
            "function": record.funcName,
        }
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_record)


def get_logger(
    name: str = "nexusa",
    log_dir: str = "logs",
    level: Optional[int] = None,
    json_logs: bool = False,
) -> logging.Logger:
    """
    Create (or retrieve) a configured logger with rotating file + console handlers.

    If the logger already has handlers attached, it is returned as-is to avoid duplicates.

    Args:
        name: Logger name and base filename for the log file.
        log_dir: Directory path where log files will be stored.
        level: Explicit logging level (e.g., logging.INFO). If None, uses `_get_env_log_level()`.
        json_logs: If True, logs are formatted as JSON; otherwise as human-readable text.

    Returns:
        A `logging.Logger` instance configured with handlers and formatters.
    """
    Path(log_dir).mkdir(parents=True, exist_ok=True)
    log_file = Path(log_dir) / f"{name}.log"

    logger = logging.getLogger(name)
    if logger.hasHandlers():
        return logger  # avoid re-adding handlers

    logger.setLevel(level or _get_env_log_level())

    formatter = (
        JsonFormatter(datefmt="%Y-%m-%d %H:%M:%S")
        if json_logs
        else logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )

    file_handler = RotatingFileHandler(
        log_file, maxBytes=10_000_000, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    # Console output mirrors file formatting unless JSON is disabled for readability
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    return logger


def _get_env_log_level() -> int:
    """
    Resolve the logging level from environment variable `LOG_LEVEL` (default: INFO).

    Returns:
        A numeric logging level (e.g., logging.INFO) recognized by the logging module.
    """
    level_str = os.getenv("LOG_LEVEL", "INFO").upper()
    return getattr(logging, level_str, logging.INFO)
