"""Content service FastAPI application.

Exposes the FastAPI app, attaches tracing middleware, includes content routes,
and initializes the database connection on startup.
"""

from fastapi import FastAPI
from packages.common.tracing import trace_middleware
from .routes import router as content_router
from .repo import init_db

app = FastAPI(title="NEXUSA Content Service", version="1.0.0")
app.middleware("http")(trace_middleware)
app.include_router(content_router)


@app.on_event("startup")
async def _init() -> None:
    """Initialize service dependencies at application startup."""
    await init_db()
