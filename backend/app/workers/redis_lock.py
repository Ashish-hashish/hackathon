"""Distributed leader lock helper using Redis."""

import asyncio
import uuid
from typing import Optional
import redis.asyncio as redis


class LeaderLock:
    """Manages an auto-renewing Redis distributed lock for worker singleton roles."""

    def __init__(self, r: redis.Redis, lock_key: str, ttl_seconds: int = 15):
        self.r = r
        self.lock_key = lock_key
        self.ttl = ttl_seconds
        self.lock_value = str(uuid.uuid4())
        self.acquired = False
        self._renew_task: Optional[asyncio.Task] = None

    async def acquire(self) -> bool:
        """Attempts to acquire the lock."""
        res = await self.r.set(self.lock_key, self.lock_value, nx=True, ex=self.ttl)
        if res:
            self.acquired = True
            self._renew_task = asyncio.create_task(self._renew_loop())
            return True
        return False

    async def _renew_loop(self):
        try:
            while self.acquired:
                await asyncio.sleep(self.ttl / 2)
                # Check still ours and renew
                val = await self.r.get(self.lock_key)
                if val == self.lock_value.encode("utf-8") or val == self.lock_value:
                    await self.r.expire(self.lock_key, self.ttl)
                else:
                    self.acquired = False
                    break
        except asyncio.CancelledError:
            pass

    async def release(self):
        """Releases the lock safely."""
        self.acquired = False
        if self._renew_task:
            self._renew_task.cancel()
        val = await self.r.get(self.lock_key)
        if val == self.lock_value.encode("utf-8") or val == self.lock_value:
            await self.r.delete(self.lock_key)
