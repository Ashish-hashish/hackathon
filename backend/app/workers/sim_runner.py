"""Simulation runner process for background scenario execution."""

import asyncio
import logging
import os
import json
import time
import redis.asyncio as redis
from sim.headless.simulate import run_headless_simulation
from fairdrop_core.config import DefenseFlags

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] sim_runner: %(message)s")
logger = logging.getLogger("sim_runner")


async def main():
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    r = redis.from_url(redis_url)
    logger.info("Simulation runner worker started. Listening for scenario jobs...")

    while True:
        try:
            # Poll for scenario jobs from Redis queue (lpop + short sleep)
            job_raw = await r.lpop("scenario_jobs")
            if not job_raw:
                await asyncio.sleep(1)
                continue

            job_str = job_raw.decode("utf-8") if isinstance(job_raw, bytes) else job_raw
            if "::" not in job_str:
                continue

            job_id, payload_str = job_str.split("::", 1)
            payload = json.loads(payload_str)

            logger.info(f"Running scenario job {job_id}...")
            flags = DefenseFlags.from_dict(payload.get("flags", {}))
            
            result = run_headless_simulation(
                total_users=payload.get("total_users", 5000),
                capacity=payload.get("capacity", 500),
                bot_share=payload.get("bot_share", 0.20),
                identities_per_bot=payload.get("identities_per_bot", 10),
                flags=flags,
                seed=payload.get("seed")
            )

            # Store result in Redis
            await r.set(f"scenario_result:{job_id}", json.dumps(result), ex=3600)
            logger.info(f"Completed scenario job {job_id}.")

        except asyncio.CancelledError:
            break
        except (redis.exceptions.TimeoutError, TimeoutError):
            # Normal timeout when socket is idle; safely yield and retry
            await asyncio.sleep(1)
        except Exception as e:
            logger.error(f"Error in sim runner loop: {e}", exc_info=True)
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
