from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    """Strongly-typed settings model loaded from env / .env.

    Notes:
        - Critical secrets and DSNs must be provided via environment variables.
        - No insecure defaults are shipped; application will fail-fast if missing.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        protected_namespaces=()
    )

    ENV: str = Field(..., description="Deployment environment, e.g. dev/staging/prod")
    SERVICE_NAME: str = Field(default="nexusa", description="Service name")

    POSTGRES_DSN: str = Field(..., description="Postgres connection DSN")
    REDIS_URL: str = Field(..., description="Redis connection URL")
    KAFKA_BOOTSTRAP: str = Field(..., description="Kafka bootstrap servers")
    NATS_URL: str = Field(..., description="NATS URL")
    VECTOR_DB_URL: str = Field(..., description="Vector DB DSN (pgvector)")

    S3_ENDPOINT: str = Field(..., description="S3 endpoint URL")
    S3_BUCKET: str = Field(..., description="S3 bucket name")
    S3_ACCESS_KEY: str = Field(..., description="S3 access key (must be provided)")
    S3_SECRET_KEY: str = Field(..., description="S3 secret key (must be provided)")

    JWT_PUBLIC_KEY: str = Field(..., description="JWT public key (must be provided)")
    OIDC_ISSUER: str = Field(..., description="OIDC issuer URL")
    OIDC_AUDIENCE: str = Field(..., description="OIDC audience")

    CLICKHOUSE_DSN: str = Field(..., description="ClickHouse DSN with user/password")


@lru_cache()
def get_settings() -> Settings:
    """Return a cached singleton `Settings` instance."""
    return Settings()
