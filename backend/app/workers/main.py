"""Entry point for the background worker container.

Spawns asyncio tasks for persister, drawer, admitter, expirer, and reconciler across all active events.
Gracefully shuts down on SIGINT/SIGTERM.
"""

import asyncio
import logging
import os
import signal
import redis.asyncio as redis
from app.db.connection import get_db_pool, close_db_pool
from app.workers.persister import run_persister
from app.workers.admitter import run_admitter
from app.workers.expirer import run_expirer
from app.workers.reconciler import run_reconciler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("worker.main")


async def main():
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    batch_size = int(os.getenv("ADMISSION_BATCH_SIZE", "50"))
    hold_ttl = int(os.getenv("HOLD_TTL_SECONDS", "180"))
    max_seats = int(os.getenv("MAX_SEATS_PER_CLUSTER", "1"))

    r = redis.from_url(redis_url)
    pool = await get_db_pool()

    stop_event = asyncio.Event()

    def handle_signal():
        logger.info("Received termination signal. Shutting down workers...")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            pass

    tasks = [
        asyncio.create_task(run_persister(r, pool, stop_event)),
        asyncio.create_task(run_admitter(r, pool, stop_event, batch_size, hold_ttl, max_seats)),
        asyncio.create_task(run_expirer(r, pool, stop_event)),
        asyncio.create_task(run_reconciler(r, pool, stop_event)),
    ]

    logger.info("All dynamic multi-event worker tasks launched.")
    await stop_event.wait()

    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)

    await r.aclose()
    await close_db_pool()
    logger.info("Worker shutdown complete.")


if __name__ == "__main__":
    asyncio.run(main())
