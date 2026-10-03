"""Persister worker role.

Consumes entries from Redis entry_stream and batch-inserts them into PostgreSQL.
Decouples the O(1) /entry hot path from database write latency.
"""

import asyncio
import logging
from typing import List, Dict, Any
import redis.asyncio as redis
import asyncpg
from app.db.queries import batch_insert_entries
from app.services.redis_keys import key_entry_stream

logger = logging.getLogger("worker.persister")


async def run_persister(r: redis.Redis, pool: asyncpg.Pool, stop_event: asyncio.Event):
    """Continuously consumes from entry_stream and persists to Postgres."""
    stream_name = key_entry_stream()
    group_name = "persister_group"
    consumer_name = "persister_worker_1"

    # Create consumer group if not already existing
    try:
        await r.xgroup_create(stream_name, group_name, id="0", mkstream=True)
    except Exception as e:
        # BUSYGROUP Consumer Group name already exists is expected on restarts
        if "BUSYGROUP" not in str(e):
            logger.warning(f"Error creating xgroup: {e}")

    logger.info("Persister worker started.")

    while not stop_event.is_set():
        try:
            # Read batch from stream
            entries_data = await r.xreadgroup(
                groupname=group_name,
                consumername=consumer_name,
                streams={stream_name: ">"},
                count=100,
                block=2000
            )

            if not entries_data:
                continue

            for stream, messages in entries_data:
                batch: List[Dict[str, Any]] = []
                msg_ids: List[str] = []

                for msg_id, raw_fields in messages:
                    # Parse byte keys/values to str
                    fields = {
                        k.decode("utf-8") if isinstance(k, bytes) else k:
                        v.decode("utf-8") if isinstance(v, bytes) else v
                        for k, v in raw_fields.items()
                    }
                    batch.append(fields)
                    msg_ids.append(msg_id)

                if batch:
                    # Write batch to Postgres
                    await batch_insert_entries(pool, batch)
                    # Acknowledge processed messages
                    await r.xack(stream_name, group_name, *msg_ids)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Persister batch error: {e}", exc_info=True)
            await asyncio.sleep(1)

    logger.info("Persister worker stopped.")
