"""Tests for the Content service FastAPI app."""

import pytest
from httpx import AsyncClient
from services.content.app import app


@pytest.mark.asyncio
async def test_openapi_ok() -> None:
    """OpenAPI schema endpoint should respond with HTTP 200."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        r = await ac.get("/openapi.json")
    if r.status_code != 200:
        pytest.fail(f"Expected 200, got {r.status_code}")
