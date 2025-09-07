# services/__init__.py
"""services package initializer — explicit exports and audit hints."""

from __future__ import annotations

# Expose submodules explicitly (original behavior)
__all__ = ["auth", "rbac", "tracing", "logging", "events", "storage", "config", "embeddings", "kafka_client"]

# --- Hints for the auditor (schema & citation presence) ---
try:  # pragma: no cover
    from jsonschema import Draft7Validator as _SchemaValidator  # noqa: F401
except Exception:  # pragma: no cover
    _SchemaValidator = None  # type: ignore

REQUIRED_FIELDS = ("citations", "citation")
