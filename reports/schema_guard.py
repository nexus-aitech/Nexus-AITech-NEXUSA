# reports/schema_guard.py
"""Schema guard for report payloads with JSON Schema validation and citation checks.

- Avoids layer violation by lazily importing the storage registry via `importlib`.
- Validates payloads against registered schemas (Draft7).
- Enforces non-empty `citations` for each `insight` when an insights list is present.
"""

from __future__ import annotations
from typing import Any, Dict, List, Callable, Optional
from jsonschema import validate, ValidationError, Draft7Validator, SchemaError
import importlib
import logging

logger = logging.getLogger("schema_guard")


class SchemaValidationError(ValueError):
    """Raised when a payload fails schema validation or required guardrail checks."""

    def __init__(self, name: str, version: str, message: str, path: List[Any] | None = None) -> None:
        """Build a descriptive validation error with dotted JSON path context."""
        self.name = name
        self.version = version
        self.path = path or []
        super().__init__(f"[{name} v{version}] Schema validation failed at {'.'.join(map(str, self.path))}: {message}")


def _lazy_registry_getter() -> Callable[[str, str], Dict[str, Any]]:
    """Import and return `storage.schema_registry.get` without creating a static dependency."""
    try:
        mod = importlib.import_module("storage.schema_registry")
        getter = getattr(mod, "get", None)
        if not callable(getter):
            raise AttributeError("storage.schema_registry.get is not callable")
        return getter  # type: ignore[return-value]
    except Exception as e:  # pragma: no cover
        raise RuntimeError("Unable to import storage.schema_registry.get lazily") from e


def ensure(
    name: str,
    version: str,
    payload: Dict[str, Any],
    *,
    registry_get: Optional[Callable[[str, str], Dict[str, Any]]] = None,
) -> None:
    """
    Ensure that `payload` conforms to the JSON Schema registered under (`name`, `version`).
    Also enforces that every insight contains at least one citation, if an insights list exists.

    Args:
        name: Schema name in the registry.
        version: Schema version (e.g., "2.0.0").
        payload: The JSON-like object to validate.
        registry_get: Optional injection for the registry getter (for testing/decoupling).

    Raises:
        RuntimeError: If the schema cannot be retrieved.
        SchemaValidationError: If validation or guardrail checks fail.
        SchemaError: If the registered schema itself is invalid.
    """
    logger.debug(f"🔎 Validating payload for schema: {name} v{version}")

    # Fetch schema from registry (lazy import to avoid layer violation)
    getter = registry_get or _lazy_registry_getter()
    try:
        schema = getter(name, version)
    except Exception as e:
        logger.error(f"❌ Failed to fetch schema {name} v{version}: {e}")
        raise RuntimeError(f"Unable to retrieve schema '{name}' v{version}") from e

    # Validate against JSON Schema
    try:
        validator = Draft7Validator(schema)
        errors = sorted(validator.iter_errors(payload), key=lambda e: e.path)
        if errors:
            err = errors[0]  # first error for clarity
            raise SchemaValidationError(name, version, err.message, list(err.path))
        logger.debug(f"✅ Schema validated successfully: {name} v{version}")
    except SchemaError as se:
        logger.exception(f"❌ Schema definition is invalid for {name} v{version}: {se}")
        raise
    except ValidationError as ve:
        logger.warning(f"⚠️ Schema validation error: {ve.message}")
        raise SchemaValidationError(name, version, ve.message, list(ve.path)) from ve

    # ---- Extra guardrail for LLM reports: enforce non-empty citations per insight ----
    insights = payload.get("insights")
    if isinstance(insights, list):
        for idx, ins in enumerate(insights):
            if not isinstance(ins, dict):
                raise SchemaValidationError(name, version, "insight must be an object", ["insights", idx])
            cits = ins.get("citations")
            if not isinstance(cits, list) or len(cits) == 0:
                raise SchemaValidationError(
                    name,
                    version,
                    "insight.citations must contain at least one item",
                    ["insights", idx, "citations"],
                )
