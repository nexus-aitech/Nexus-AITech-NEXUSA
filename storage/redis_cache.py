"""Redis-backed read-through cache for short-lived feature data.

This module provides a minimal read-through cache (JSON-serialized) keyed by
`{prefix}:{symbol}:{tf}` with a short TTL plus jitter to avoid thundering herds.
"""

from __future__ import annotations
import json
import random
import time
from typing import Any, Callable, Dict, Optional

try:  # pragma: no cover
    import redis
except Exception:
    redis = None

DEFAULT_TTL_SEC = 30  # short-lived feature cache
JITTER_SEC = 5

class ReadThroughCache:
    """
    Read-through cache for latest features.
    Keys: features:{symbol}:{tf}
    Stored as JSON with a short TTL + jitter to spread invalidations.
    """
    def __init__(self, url: str = "redis://localhost:6379/0", prefix: str = "features") -> None:
        """Initialize the cache client.

        Args:
            url: Redis connection URL (db with decode_responses=True).
            prefix: Key namespace/prefix, e.g., "features".
        Raises:
            RuntimeError: If redis-py is not available.
        """
        if redis is None:
            raise RuntimeError("redis-py is required for ReadThroughCache")
        self._r = redis.from_url(url, decode_responses=True)
        self._prefix = prefix

    def _key(self, symbol: str, tf: Optional[str]) -> str:
        """Build a namespaced cache key for a (symbol, timeframe)."""
        tfp = tf or "NA"
        return f"{self._prefix}:{symbol}:{tfp}"

    def get_latest(
        self,
        symbol: str,
        tf: Optional[str],
        fetch_fn: Callable[[], Dict[str, Any]],
        ttl_sec: int = DEFAULT_TTL_SEC,
    ) -> Dict[str, Any]:
        """Get latest data from cache or fetch, set, and return.

        On cache hit: returns JSON-decoded dict.
        On miss or JSON decode error: calls `fetch_fn`, validates dict, stores with TTL+ jitter.

        Args:
            symbol: Instrument symbol.
            tf: Timeframe identifier (or None).
            fetch_fn: Zero-arg callable returning a dict to cache.
            ttl_sec: Base TTL in seconds (jitter is added automatically).

        Returns:
            Dict[str, Any]: The latest payload.

        Raises:
            ValueError: If `fetch_fn` does not return a dict.
        """
        k = self._key(symbol, tf)
        val = self._r.get(k)
        if val is not None:
            try:
                return json.loads(val)
            except Exception:
                # fall through to refetch
                pass
        # Cache miss: fetch and set
        data = fetch_fn()
        if not isinstance(data, dict):
            raise ValueError("fetch_fn must return a dict")
        payload = json.dumps(data, separators=(",", ":"))
        expiry = ttl_sec + random.randint(0, JITTER_SEC)
        self._r.setex(k, expiry, payload)
        return data

    def invalidate(self, symbol: str, tf: Optional[str]) -> None:
        """Invalidate a cached entry for (symbol, timeframe)."""
        self._r.delete(self._key(symbol, tf))
