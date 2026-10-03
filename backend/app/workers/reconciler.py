"""Reconciler worker role.

Periodically verifies inventory integrity invariant across Redis and Postgres:
    confirmed + active_holds + available == capacity
Alarms immediately if any oversell or drift is detected across all active events.
"""

import asyncio
import json
import logging
import os
import time
import redis.asyncio as redis
import asyncpg
from app.db.queries import check_reconciliation
from app.services.redis_keys import (
    key_inventory, key_leader_lock, key_window
)
from app.workers.redis_lock import LeaderLock
from app.workers.admitter import get_all_event_ids

logger = logging.getLogger("worker.reconciler")


async def run_reconciler(
    r: redis.Redis,
    pool: asyncpg.Pool,
    stop_event: asyncio.Event,
    interval_seconds: int = 5
):
    """Reconciliation loop verifying zero oversell and integrity across all active events."""
    lock = LeaderLock(r, key_leader_lock("reconciler"), ttl_seconds=15)
    default_event_id = os.getenv("EVENT_ID", "event_drop_001")
    default_capacity = int(os.getenv("EVENT_CAPACITY", "500"))
    logger.info("Reconciler worker started.")

    while not stop_event.is_set():
        try:
            if not lock.acquired:
                got_lock = await lock.acquire()
                if not got_lock:
                    await asyncio.sleep(2)
                    continue
                logger.info("Acquired reconciler leader lock.")

            event_ids = await get_all_event_ids(r, pool, default_event_id)

            for eid in event_ids:
                capacity = default_capacity
                if pool:
                    try:
                        async with pool.acquire() as conn:
                            row = await conn.fetchrow("SELECT capacity FROM events WHERE id = $1;", eid)
                            if row:
                                capacity = row["capacity"]
                    except Exception:
                        pass

                # 1. Check Postgres stats
                stats = await check_reconciliation(pool, eid, capacity)

                # 2. Check Redis available inventory
                redis_inv_raw = await r.get(key_inventory(eid))
                redis_inv = int(redis_inv_raw or capacity)

                # 3. Check for oversell / discrepancy
                mismatch = False
                error_msg = ""
                if stats["oversell"] > 0:
                    mismatch = True
                    error_msg = f"OVERSELL DETECTED in [{eid}]! Total allocated ({stats['confirmed'] + stats['active_holds']}) exceeds capacity {capacity}!"
                    logger.critical(error_msg)
                elif abs(stats["available"] - redis_inv) > 5:
                    mismatch = True
                    error_msg = f"Inventory drift in [{eid}]: Postgres available={stats['available']}, Redis available={redis_inv}"
                    logger.warning(error_msg)

                # 4. Store latest health report in Redis for Ops dashboard
                report = {
                    "timestamp": int(time.time()),
                    "event_id": eid,
                    "capacity": capacity,
                    "confirmed": stats["confirmed"],
                    "active_holds": stats["active_holds"],
                    "available": redis_inv,
                    "oversell": stats["oversell"],
                    "is_healthy": not mismatch,
                    "error": error_msg
                }
                await r.set(f"reconcile_status:{eid}", json.dumps(report), ex=30)

            await asyncio.sleep(interval_seconds)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Reconciler error: {e}", exc_info=True)
            await asyncio.sleep(interval_seconds)

    await lock.release()
    logger.info("Reconciler worker stopped.")
