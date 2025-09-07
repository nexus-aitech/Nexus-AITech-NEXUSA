"""S3/MinIO Parquet archiver utilities.

Provides a small ParquetArchiver for partitioned writes and a helper to upload
a pandas DataFrame to S3-compatible storage. Keeps behavior unchanged; adds
docstrings for linters.
"""

from __future__ import annotations
import json
import time
import boto3, io, pandas as pd
from core.config.config import settings
from typing import Any, Dict, Iterable, List, Optional
from dataclasses import dataclass

try:  # pragma: no cover
    import pyarrow as pa
    import pyarrow.parquet as pq
    from pyarrow.fs import FileSystem, S3FileSystem, LocalFileSystem
except Exception:
    pa = None
    pq = None
    FileSystem = object
    S3FileSystem = object
    LocalFileSystem = object

@dataclass
class S3Config:
    """Connection/config parameters for S3-compatible storage (e.g., AWS S3, MinIO)."""

    bucket: str
    region: Optional[str] = None
    endpoint: Optional[str] = None  # for MinIO
    access_key: Optional[str] = None
    secret_key: Optional[str] = None
    session_token: Optional[str] = None
    scheme: str = "https"
    anonymous: bool = False

class ParquetArchiver:
    """
    Write normalized events to S3/MinIO in partitioned Parquet layout:
    s3://bucket/prefix/symbol=BTCUSDT/tf=1m/date=2025-08-21/part-0001.snappy.parquet
    Also maintains a lightweight manifest.json with file list + row counts.
    """

    def __init__(
        self,
        prefix: str,
        s3: Optional[S3Config] = None,
        fs: Optional[FileSystem] = None,
    ) -> None:
        """Create an archiver bound to a filesystem (S3 or local) and base prefix."""
        if pq is None or pa is None:
            raise RuntimeError("pyarrow is required for ParquetArchiver")
        self.prefix = prefix.rstrip("/")
        if fs is not None:
            self.fs = fs
        elif s3 is not None:
            self.fs = S3FileSystem(
                region=s3.region,
                endpoint_override=s3.endpoint,
                access_key=s3.access_key,
                secret_key=s3.secret_key,
                session_token=s3.session_token,
                scheme=s3.scheme,
                anonymous=s3.anonymous,
            )
            self.bucket = s3.bucket
        else:
            self.fs = LocalFileSystem()
            self.bucket = ""

    def _manifest_path(self, partition_path: str) -> str:
        """Return the _manifest.json full path within a given partition directory."""
        return f"{partition_path.rstrip('/')}/_manifest.json"

    def _write_manifest(self, partition_path: str, entry: Dict[str, Any]) -> None:
        """Best-effort write of the manifest file (non-fatal on failure)."""
        path = self._manifest_path(partition_path)
        try:
            with self.fs.open_output_stream(path) as out:
                payload = json.dumps(entry, indent=0, separators=(",", ":")).encode("utf-8")
                out.write(payload)
        except Exception:
            # Non-fatal
            pass

    def write_batch(self, partition_path: str, rows: List[Dict[str, Any]]) -> str:
        """
        rows: list of normalized events (dict) to store in Parquet.
        Returns the written Parquet path.
        """
        ts = int(time.time() * 1000)
        part_name = f"part-{ts}.snappy.parquet"
        full_path = f"{partition_path.rstrip('/')}/{part_name}"

        # schema: store generic event fields + payload JSON
        schema = pa.schema([
            pa.field("v", pa.int64()),
            pa.field("source", pa.string()),
            pa.field("event_type", pa.string()),
            pa.field("symbol", pa.string()),
            pa.field("tf", pa.string()).with_nullable(True),
            pa.field("ts_event", pa.int64()),
            pa.field("ingest_ts", pa.int64()),
            pa.field("correlation_id", pa.string()),
            pa.field("payload", pa.string()),
        ])

        # normalize rows
        def _norm(r: Dict[str, Any]) -> Dict[str, Any]:
            """Normalize a single event row to the Parquet schema."""
            out = {
                "v": int(r.get("v", 2)),
                "source": str(r.get("source", "")),
                "event_type": str(r.get("event_type", "")),
                "symbol": str(r.get("symbol", "")),
                "tf": None if r.get("tf") in (None, "None") else str(r.get("tf")),
                "ts_event": int(r.get("ts_event", 0)),
                "ingest_ts": int(r.get("ingest_ts", 0)),
                "correlation_id": str(r.get("correlation_id", "")),
                "payload": json.dumps(r.get("payload", {}), separators=(",", ":")),
            }
            return out

        norm_rows = [_norm(r) for r in rows]
        table = pa.Table.from_pylist(norm_rows, schema=schema)
        pq.write_table(
            table,
            full_path,
            filesystem=self.fs,
            compression="snappy",
            write_statistics=True,
            use_dictionary=True,
        )

        # manifest
        manifest = {"files":[part_name], "rows": len(rows), "last_write_ms": ts}
        self._write_manifest(partition_path, manifest)
        return full_path

def upload_parquet(df: pd.DataFrame, key: str) -> None:
    """Upload a DataFrame as Parquet to S3/MinIO at the given object key."""
    s3 = boto3.client("s3", endpoint_url=settings.s3.endpoint, aws_access_key_id=settings.s3.access_key, aws_secret_access_key=settings.s3.secret_key, region_name=settings.s3.region)
    buf = io.BytesIO()
    df.to_parquet(buf, index=False)
    buf.seek(0)
    s3.create_bucket(Bucket=settings.s3.bucket) if settings.env == "dev" else None
    s3.put_object(Bucket=settings.s3.bucket, Key=key, Body=buf.getvalue())
