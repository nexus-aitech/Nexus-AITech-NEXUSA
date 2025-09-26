from __future__ import annotations
import os
import time
import socket
import asyncio
import logging
from typing import Any, Optional, List

from fastapi import FastAPI, HTTPException, Query, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import JSONResponse
from core.config.config import settings

log = logging.getLogger("api")

# -------------------------------------------------
# FastAPI Application
# -------------------------------------------------
app = FastAPI(
    title="NEXUSA API",
    version="1.0.0",
    description="Real-time signal/feature API for crypto market intelligence",
)

# -------------------------------------------------
# Middleware (CORS)
# -------------------------------------------------
if settings.env == "dev":
    _raw = os.getenv("FRONTEND_ORIGINS", "http://localhost:3001")
    ALLOW_ORIGINS = [o.strip() for o in _raw.split(",") if o.strip()]
else:
    _raw = os.getenv("FRONTEND_ORIGINS", "")
    if not _raw.strip():
        raise RuntimeError("FRONTEND_ORIGINS must be set in production (comma-separated).")
    ALLOW_ORIGINS = [o.strip() for o in _raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# -------------------------------------------------
# Models
# -------------------------------------------------
class FeatureResponse(BaseModel):
    symbol: str
    tf: str
    features: dict

# -------------------------------------------------
# Basic Routes
# -------------------------------------------------
@app.get("/healthz", tags=["infra"])
def healthz() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}

@app.get("/health", tags=["infra"])
def health_alias() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}

@app.head("/healthz", tags=["infra"])
async def healthz_head():
    return PlainTextResponse("", status_code=200)

@app.head("/health", tags=["infra"])
async def health_head():
    return PlainTextResponse("", status_code=200)

@app.get("/metrics", tags=["infra"])
def metrics() -> PlainTextResponse:
    data = generate_latest()
    return PlainTextResponse(data.decode("utf-8"), media_type=CONTENT_TYPE_LATEST)

@app.get("/", tags=["meta"])
def root() -> dict[str, Any]:
    return {
        "message": "Welcome to NEXUSA API",
        "endpoints": ["/healthz", "/metrics", "/features/{symbol}/{tf}", "/system/health"],
    }

# -------------------------------------------------
# Feature Routes
# -------------------------------------------------
@app.get("/features/{symbol}/{tf}", response_model=FeatureResponse, tags=["features"])
def get_feature(symbol: str, tf: str, keys: Optional[List[str]] = Query(default=None)):
    from features.feature_store import read_latest_feature  # lazy import
    row = read_latest_feature(symbol, tf, keys)
    if not row:
        raise HTTPException(status_code=404, detail="No features found")
    return FeatureResponse(symbol=symbol, tf=tf, features=row)

# -------------------------------------------------
# System Router (checks Redis, Kafka, ClickHouse, MinIO)
# -------------------------------------------------
router = APIRouter()
START_TIME = time.time()

@router.get("/system/health", tags=["system"])
async def system_health():
    uptime = round(time.time() - START_TIME, 2)

    async def run_blocking(fn, *args, timeout: float = 2.0, **kwargs):
        try:
            return await asyncio.wait_for(asyncio.to_thread(fn, *args, **kwargs), timeout=timeout)
        except Exception as e:
            raise e

    checks: dict[str, Any] = {}

    # Redis
    try:
        def _check_redis():
            import redis
            r = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
            return r.ping()
        await run_blocking(_check_redis, timeout=1.5)
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e.__class__.__name__}"

    # Kafka
    try:
        def _check_kafka():
            from kafka import KafkaProducer
            bootstrap = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
            prod = KafkaProducer(
                bootstrap_servers=bootstrap,
                request_timeout_ms=1500,
                api_version_auto_timeout_ms=1500,
                retries=0,
                connections_max_idle_ms=1000,
                metadata_max_age_ms=1000,
            )
            ok = prod.bootstrap_connected()
            prod.close()
            if not ok:
                raise RuntimeError("bootstrap not connected")
            return True
        await run_blocking(_check_kafka, timeout=2.0)
        checks["kafka"] = "ok"
    except Exception as e:
        checks["kafka"] = f"error: {e.__class__.__name__}"

    # ClickHouse
    try:
        def _check_clickhouse():
            from clickhouse_driver import Client
            host = os.getenv("CLICKHOUSE_HOST", "localhost")
            port = int(os.getenv("CLICKHOUSE_PORT", "9000"))
            client = Client(
                host=host,
                port=port,
                connect_timeout=1,
                send_receive_timeout=1,
                settings={"max_execution_time": 1},
            )
            client.execute("SELECT 1")
            return True
        await run_blocking(_check_clickhouse, timeout=2.0)
        checks["clickhouse"] = "ok"
    except Exception as e:
        checks["clickhouse"] = f"error: {e.__class__.__name__}"

    # S3 / MinIO
    try:
        def _check_s3():
            from botocore.config import Config as BotoConfig
            import boto3
            s3 = boto3.client(
                "s3",
                endpoint_url=os.getenv("S3_ENDPOINT"),
                aws_access_key_id=os.getenv("S3_ACCESS_KEY"),
                aws_secret_access_key=os.getenv("S3_SECRET_KEY"),
                region_name=os.getenv("S3_REGION", "us-east-1"),
                config=BotoConfig(connect_timeout=1, read_timeout=1, retries={"max_attempts": 0}),
            )
            s3.list_buckets()
            return True
        await run_blocking(_check_s3, timeout=2.0)
        checks["s3"] = "ok"
    except Exception as e:
        checks["s3"] = f"error: {e.__class__.__name__}"

    overall_ok = all(v == "ok" for v in checks.values()) if checks else True
    status = "ok" if overall_ok else "degraded"

    payload = {
        "status": status,
        "env": getattr(settings, "env", os.getenv("ENV", "dev")),
        "uptime_seconds": uptime,
        "hostname": socket.gethostname(),
        "services": checks,
        "version": getattr(settings, "version", "unknown"),
    }
    return JSONResponse(payload)

# -------------------------------------------------
# Mount Router
# -------------------------------------------------
app.include_router(router)
