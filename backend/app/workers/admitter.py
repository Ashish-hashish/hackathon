"""Admitter worker role.

Singleton role (leader-locked) that admits entries from the queue in batches via admit.lua.
Enforces cluster seat caps (MAX_SEATS_PER_CLUSTER) atomically across all active events.
"""

import asyncio
import logging
import os
import time
from pathlib import Path
from typing import List, Set
import redis.asyncio as redis
import asyncpg
from app.services.redis_keys import (
    key_window, key_inventory, key_queue, key_result,
    key_cluster_seats, key_holds_exp, key_seat_log, key_leader_lock
)
from app.workers.redis_lock import LeaderLock

logger = logging.getLogger("worker.admitter")

# Load Lua script content
LUA_DIR = Path(__file__).resolve().parent.parent / "redis_scripts"
with open(LUA_DIR / "admit.lua", "r") as f:
    ADMIT_LUA = f.read()


async def get_all_event_ids(r: redis.Redis, pool: asyncpg.Pool, default_id: str) -> Set[str]:
    """Retrieves all event IDs registered in Redis and Postgres."""
    events = {default_id}
    try:
        members = await r.smembers("active_events")
        for m in members:
            events.add(m.decode("utf-8") if isinstance(m, bytes) else m)
    except Exception:
        pass

    if pool:
        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch("SELECT id FROM events;")
                for row in rows:
                    events.add(row["id"])
        except Exception:
            pass
    return events


async def run_admitter(
    r: redis.Redis,
    pool: asyncpg.Pool,
    stop_event: asyncio.Event,
    batch_size: int = 50,
    hold_ttl_seconds: int = 180,
    max_seats_per_cluster: int = 1
):
    """Batched admission worker loop with leader election across all active events."""
    lock = LeaderLock(r, key_leader_lock("admitter"), ttl_seconds=15)
    admit_script = r.register_script(ADMIT_LUA)
    default_event_id = os.getenv("EVENT_ID", "event_drop_001")

    logger.info("Admitter worker started. Waiting for leader lock...")

    while not stop_event.is_set():
        try:
            if not lock.acquired:
                got_lock = await lock.acquire()
                if not got_lock:
                    await asyncio.sleep(2)
                    continue
                logger.info("Acquired admitter leader lock.")

            event_ids = await get_all_event_ids(r, pool, default_event_id)

            for eid in event_ids:
                # Check if event state is DRAWN
                state = await r.get(key_window(eid))
                state_str = state.decode("utf-8") if isinstance(state, bytes) else state
                if state_str != "DRAWN":
                    continue

                # Check inventory and queue length
                inv = await r.get(key_inventory(eid))
                inv_int = int(inv or 0)
                q_len = await r.llen(key_queue(eid))

                if inv_int > 0 and q_len > 0:
                    now_sec = int(time.time())
                    keys = [
                        key_inventory(eid),
                        key_queue(eid),
                        key_result(eid),
                        key_cluster_seats(eid),
                        key_holds_exp(eid),
                        key_seat_log()
                    ]
                    args = [
                        eid,
                        batch_size,
                        now_sec,
                        hold_ttl_seconds,
                        max_seats_per_cluster
                    ]

                    res = await admit_script(keys=keys, args=args)
                    admitted_count, rem_inv = res[0], res[1]
                    if admitted_count > 0:
                        logger.info(f"[{eid}] Admitted {admitted_count} entries. Remaining inventory: {rem_inv}.")

            await asyncio.sleep(1)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Admitter error: {e}", exc_info=True)
            await asyncio.sleep(2)

    await lock.release()
    logger.info("Admitter worker stopped.")
