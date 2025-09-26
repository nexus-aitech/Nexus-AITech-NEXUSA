# orchestration/ws_hub.py
from __future__ import annotations
import asyncio
from typing import Any, Set

class BroadcastHub:
    def __init__(self) -> None:
        self._clients: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def register(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=1000)
        async with self._lock:
            self._clients.add(q)
        return q

    async def unregister(self, q: asyncio.Queue) -> None:
        async with self._lock:
            self._clients.discard(q)

    async def publish(self, item: Any) -> None:
        async with self._lock:
            dead = []
            for q in self._clients:
                try:
                    q.put_nowait(item)
                except asyncio.QueueFull:
                    dead.append(q)  # کلاینتی که عقب افتاده حذف می‌شود
            for q in dead:
                self._clients.discard(q)

hub = BroadcastHub()
