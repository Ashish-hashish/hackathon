"""Expirer worker role.

Singleton role (leader-locked) that scans for overdue holds across all active events and executes expire.lua.
Returns recycled seats back to inventory and unlocks next waitlist ranks.
"""

import asyncio
import logging
import os
import time
from pathlib import Path
from typing import Set
import redis.asyncio as redis
import asyncpg
from app.services.redis_keys import (
    key_holds_exp, key_inventory, key_cluster_seats,
    key_result, key_seat_log, key_leader_lock, key_window
)
from app.workers.redis_lock import LeaderLock
from app.workers.admitter import get_all_event_ids

logger = logging.getLogger("worker.expirer")

LUA_DIR = Path(__file__).resolve().parent.parent / "redis_scripts"
with open(LUA_DIR / "expire.lua", "r") as f:
    EXPIRE_LUA = f.read()


async def run_expirer(r: redis.Redis, pool: asyncpg.Pool, stop_event: asyncio.Event):
    """Expirer worker loop with leader election across all active events."""
    lock = LeaderLock(r, key_leader_lock("expirer"), ttl_seconds=15)
    expire_script = r.register_script(EXPIRE_LUA)
    default_event_id = os.getenv("EVENT_ID", "event_drop_001")

    logger.info("Expirer worker started.")

    while not stop_event.is_set():
        try:
            if not lock.acquired:
                got_lock = await lock.acquire()
                if not got_lock:
                    await asyncio.sleep(2)
                    continue
                logger.info("Acquired expirer leader lock.")

            event_ids = await get_all_event_ids(r, pool, default_event_id)
            now_sec = int(time.time())

            for eid in event_ids:
                keys = [
                    key_holds_exp(eid),
                    key_inventory(eid),
                    key_cluster_seats(eid),
                    key_result(eid),
                    key_seat_log()
                ]
                args = [eid, now_sec, 100]

                expired_count = await expire_script(keys=keys, args=args)
                if expired_count and int(expired_count) > 0:
                    logger.info(f"[{eid}] Expired {expired_count} overdue holds. Seats recycled to inventory.")

            await asyncio.sleep(1)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Expirer error: {e}", exc_info=True)
            await asyncio.sleep(2)

    await lock.release()
    logger.info("Expirer worker stopped.")
