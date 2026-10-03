"""Drawer worker role.

Executes the verifiable batch pipeline at window close (Architecture Section 6):
1. Waits for entry_stream to drain into Postgres.
2. Runs clustering (union-find) over all entries.
3. Computes risk scores and cluster weights.
4. Ranks entries deterministically using the revealed seed.
5. Persists the draw and results transaction to PostgreSQL.
6. Populates Redis queue:{evt}, result:{evt}, and sets state to DRAWN.
"""

import asyncio
import json
import logging
import os
from typing import Optional, Dict, Any, List
import redis.asyncio as redis
import asyncpg
from fairdrop_core.clustering import build_clusters
from fairdrop_core.weights import compute_weight
from fairdrop_core.draw import rank_entries, compute_commitment, compute_entries_hash
from app.db.queries import get_all_entries_for_draw, save_draw_transaction
from app.services.redis_keys import (
    key_window, key_queue, key_result, key_inventory, key_leader_lock, key_entries
)
from app.workers.redis_lock import LeaderLock

logger = logging.getLogger("worker.drawer")


async def execute_draw_pipeline(
    r: redis.Redis,
    pool: asyncpg.Pool,
    event_id: str,
    seed_secret: str,
    capacity: int = 500,
    alpha: float = 1.0,
    def_cluster_weight: bool = True,
    def_risk_score: bool = True
) -> Dict[str, Any]:
    """Runs the full batch draw pipeline deterministically."""
    logger.info(f"Starting draw pipeline for event {event_id}...")

    # Step 1: Set window state to CLOSED
    await r.set(key_window(event_id), "CLOSED")

    # Wait for entry_stream lag to drain (stream entries == postgres count)
    redis_entry_count = await r.hlen(key_entries(event_id))
    logger.info(f"Entries recorded in Redis: {redis_entry_count}. Awaiting stream drain...")
    
    entries_from_db: List[Dict[str, Any]] = []
    for _ in range(15):
        entries_from_db = await get_all_entries_for_draw(pool, event_id)
        if len(entries_from_db) >= redis_entry_count:
            break
        await asyncio.sleep(0.5)

    logger.info(f"Loaded {len(entries_from_db)} entries from Postgres for clustering and draw.")

    if not entries_from_db:
        # Edge case: zero entries
        await r.set(key_window(event_id), "DRAWN")
        return {"status": "EMPTY", "entries_count": 0}

    # Step 2: Clustering
    clusters, cluster_sizes = build_clusters(
        entries_from_db,
        enabled=def_cluster_weight
    )

    # Step 3: Weights & Risk computation
    weights: Dict[str, float] = {}
    entry_enrichment: Dict[str, Dict[str, Any]] = {}

    for e in entries_from_db:
        eid = e["entry_id"]
        c_root = clusters.get(eid, eid)
        c_size = cluster_sizes.get(c_root, 1)

        w, risk, reasons = compute_weight(
            entry=e,
            cluster_size=c_size,
            alpha=alpha,
            def_cluster_weight=def_cluster_weight,
            def_risk_score=def_risk_score
        )
        weights[eid] = w
        entry_enrichment[eid] = {
            "cluster_id": c_root,
            "weight": w,
            "risk_score": risk,
            "reason_codes": reasons
        }

    # Step 4: Deterministic Weighted Draw
    seed_bytes = seed_secret.encode("utf-8")
    commitment = compute_commitment(seed_bytes)
    entry_ids = [e["entry_id"] for e in entries_from_db]
    entries_hash = compute_entries_hash(entry_ids)

    ranked_results = rank_entries(seed_bytes, entries_from_db, weights)

    # Attach cluster_id and reasons to ranked results
    for r_item in ranked_results:
        eid = r_item["entry_id"]
        meta = entry_enrichment[eid]
        r_item["cluster_id"] = meta["cluster_id"]
        r_item["reason_codes"] = meta["reason_codes"]

    # Step 5: Persist to Postgres in a single transaction
    draw_params = {
        "capacity": capacity,
        "alpha": alpha,
        "def_cluster_weight": def_cluster_weight,
        "def_risk_score": def_risk_score,
        "commitment": commitment,
        "total_entries": len(entries_from_db),
    }
    await save_draw_transaction(
        pool=pool,
        event_id=event_id,
        entries_hash=entries_hash,
        seed_used=seed_secret,
        params=draw_params,
        results=ranked_results
    )

    # Step 6: Populate Redis queue, results hash, and inventory
    # queue:{evt} holds ranked identity_ids in order
    pipeline = r.pipeline(transaction=True)
    pipeline.delete(key_queue(event_id))
    pipeline.delete(key_result(event_id))

    # Push to queue (by rank order)
    queue_identities = [r_item["identity_id"] for r_item in ranked_results]
    if queue_identities:
        pipeline.rpush(key_queue(event_id), *queue_identities)

    # Populate result:{evt} hash
    for r_item in ranked_results:
        ident_id = r_item["identity_id"]
        res_data = {
            "entry_id": r_item["entry_id"],
            "rank": r_item["rank"],
            "weight": r_item["weight"],
            "cluster_id": r_item["cluster_id"],
            "status": "DRAWN",
            "reason_codes": r_item.get("reason_codes", [])
        }
        pipeline.hset(key_result(event_id), ident_id, json.dumps(res_data))

    # Set inventory to event capacity
    pipeline.set(key_inventory(event_id), capacity)
    # Set window state to DRAWN
    pipeline.set(key_window(event_id), "DRAWN")

    await pipeline.execute()
    logger.info(f"Draw pipeline completed successfully for {event_id}. State -> DRAWN.")

    return {
        "status": "DRAWN",
        "entries_count": len(entries_from_db),
        "commitment": commitment,
        "seed_reveal": seed_secret,
        "entries_hash": entries_hash
    }
