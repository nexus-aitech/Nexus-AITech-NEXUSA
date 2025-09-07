"""Tracing helpers for FastAPI.

Adds a request-level trace middleware that injects/propagates `X-Request-ID`
and a minimal xAPI-like event helper for telemetry logging.
"""

from .logging import configure_logging, set_request_id
from fastapi import Request, Response
from typing import Any, Callable, Awaitable, Dict
import uuid

logger = configure_logging()


async def trace_middleware(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    """ASGI middleware to attach a correlation id and echo it in the response.

    - Reads `X-Request-ID` from the incoming request or generates a UUIDv4.
    - Stores it in a ContextVar so logs include the same id.
    - Sets the same header on the outgoing response.

    Args:
        request: Incoming FastAPI request.
        call_next: The next ASGI callable that returns a `Response`.

    Returns:
        The downstream response with `X-Request-ID` header set.
    """
    rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    set_request_id(rid)
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response


def xapi_event(actor_id: str, verb: str, obj: str, **extras: Any) -> Dict[str, Any]:
    """Emit a simplified xAPI-like event and return its payload.

    Args:
        actor_id: Unique id of the actor (e.g., user id).
        verb: Action performed (e.g., "viewed", "clicked").
        obj: Object of the action (e.g., resource id).
        **extras: Additional arbitrary key/value telemetry fields.

    Returns:
        A dictionary containing the event payload.
    """
    # Simplified xAPI-esque event for telemetry
    import json, time
    event: Dict[str, Any] = {
        "actor": actor_id,
        "verb": verb,
        "object": obj,
        "ts": round(time.time(), 3),
        "extras": extras
    }
    logger.info(f"EVENT {json.dumps(event, ensure_ascii=False)}")
    return event
