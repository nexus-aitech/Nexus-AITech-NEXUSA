"""JSON logging utilities for the NEXUSA platform.

Provides:
- `set_request_id` to store a per-request correlation id in a ContextVar
- `JSONFormatter` to render logs as single-line JSON (optionally with request_id)
- `configure_logging` to set up stdout logging with the JSON formatter
"""

import logging, sys, json, time
from contextvars import ContextVar

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def set_request_id(rid: str | None) -> None:
    """Set/clear the correlation request id used in log records.

    Args:
        rid: The request id to store; pass None to clear it.
    """
    _request_id.set(rid)


class JSONFormatter(logging.Formatter):
    """Format log records as compact JSON with timestamp and optional context."""

    def format(self, record: logging.LogRecord) -> str:
        """Serialize a `logging.LogRecord` to a JSON string.

        Includes: level, epoch timestamp (seconds, 3dp), logger name, message,
        optional `request_id`, and exception info when present.
        """
        base = {
            "level": record.levelname,
            "ts": round(time.time(), 3),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        rid = _request_id.get()
        if rid:
            base["request_id"] = rid
        if record.exc_info:
            base["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(base, ensure_ascii=False)


def configure_logging(level: int | str = "INFO") -> logging.Logger:
    """Configure root logging to stdout with the JSON formatter.

    Args:
        level: Logging level as int or string (e.g., logging.INFO or "INFO").

    Returns:
        A logger instance named "nexusa".
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    logging.basicConfig(level=level, handlers=[handler], force=True)
    return logging.getLogger("nexusa")
