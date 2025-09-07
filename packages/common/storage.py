"""S3-compatible object storage helper for the NEXUSA platform.

Provides a minimal wrapper to upload objects and generate pre-signed URLs
against an S3-compatible endpoint (e.g., MinIO).
"""

from .config import get_settings
from typing import BinaryIO  # retained import for potential future use
import boto3
from botocore.client import Config as BotoConfig


class ObjectStorage:
    """Thin client around boto3 S3 for put & presign operations."""

    def __init__(self) -> None:
        """Initialize S3 client and target bucket from application settings."""
        s = get_settings()
        self.bucket = s.S3_BUCKET
        self._client = boto3.client(
            "s3",
            endpoint_url=s.S3_ENDPOINT,
            aws_access_key_id=s.S3_ACCESS_KEY,
            aws_secret_access_key=s.S3_SECRET_KEY,
            config=BotoConfig(signature_version="s3v4"),
            region_name="us-east-1",
        )

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Upload bytes to the configured bucket.

        Args:
            key: Object key/path inside the bucket.
            data: Raw bytes to upload.
            content_type: MIME type of the object.

        Returns:
            A simple locator string in the form "{bucket}/{key}".
        """
        self._client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        return f"{self.bucket}/{key}"

    def presign(self, key: str, expires: int = 3600) -> str:
        """Generate a time-limited pre-signed GET URL for an object.

        Args:
            key: Object key/path inside the bucket.
            expires: Expiration time in seconds.

        Returns:
            A pre-signed URL that can be used to download the object.
        """
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires,
        )
