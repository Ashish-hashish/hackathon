"""Public Audit router (/audit).

Spec Section 3 & Differentiator D1:
- Exposes cryptographic commitment, seed reveal, entries_hash, and draw parameters.
- Provides per-entry verification data for independent validation in the browser.
"""

import os
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Query, status
from app.db.connection import get_db_pool
from fairdrop_core.verify import verify_single_entry

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/draw")
async def get_audit_draw(request: Request, event_id: Optional[str] = Query(None)):
    """Returns public draw audit parameters: commitment, reveal, entries_hash."""
    pool = request.app.state.db_pool
    eid = event_id or os.getenv("EVENT_ID", "event_drop_001")

    if not pool:
        return {
            "event_id": eid,
            "status": "AWAITING_DATABASE",
            "commitment": None,
            "seed_reveal": None,
            "entries_hash": None
        }

    query = """
        SELECT e.id, e.commitment, e.seed_reveal, e.state, d.entries_hash, d.params
        FROM events e
        LEFT JOIN draws d ON e.id = d.event_id
        WHERE e.id = $1;
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, eid)
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "EVENT_NOT_FOUND", "message": "Event audit record not found."}
            )

        return {
            "event_id": row["id"],
            "state": row["state"],
            "commitment": row["commitment"],
            "seed_reveal": row["seed_reveal"] if row["state"] in ("DRAWN", "DONE") else None,
            "entries_hash": row["entries_hash"],
            "params": row["params"] or {}
        }


@router.get("/verify/{entry_id}")
async def verify_entry_result(
    entry_id: str,
    request: Request,
    event_id: Optional[str] = Query(None)
):
    """Returns verification mathematical parameters for a specific entry ID."""
    pool = request.app.state.db_pool
    eid = event_id or os.getenv("EVENT_ID", "event_drop_001")

    if not pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "DB_UNAVAILABLE", "message": "Audit database unavailable."}
        )

    query = """
        SELECT r.entry_id, r.rank, r.weight, r.cluster_id, r.reason_codes,
               e.seed_reveal, e.commitment, d.entries_hash
        FROM draw_results r
        JOIN events e ON r.event_id = e.id
        JOIN draws d ON r.event_id = d.event_id
        WHERE r.event_id = $1 AND r.entry_id = $2;
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, eid, entry_id)
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "ENTRY_NOT_FOUND", "message": "Entry not found in draw results."}
            )

        seed = row["seed_reveal"]
        if not seed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "SEED_NOT_YET_REVEALED", "message": "Draw seed has not been revealed yet."}
            )

        is_valid, calc_data = verify_single_entry(
            seed=seed,
            entry_id=entry_id,
            weight=row["weight"],
            claimed_rank=row["rank"]
        )

        return {
            "entry_id": entry_id,
            "rank": row["rank"],
            "weight": row["weight"],
            "cluster_id": row["cluster_id"],
            "reason_codes": row["reason_codes"] or [],
            "commitment": row["commitment"],
            "seed": seed,
            "entries_hash": row["entries_hash"],
            "computed": calc_data,
            "is_verified": is_valid
        }


@router.get("/export")
async def export_draw_results(request: Request, event_id: Optional[str] = Query(None)):
    """Downloads complete pseudonymized draw ranking for external audit and verification."""
    pool = request.app.state.db_pool
    eid = event_id or os.getenv("EVENT_ID", "event_drop_001")

    if not pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "DB_UNAVAILABLE", "message": "Audit database unavailable."}
        )

    # 1. Fetch event metadata
    meta_query = """
        SELECT e.id, e.commitment, e.seed_reveal, e.state, e.capacity, d.entries_hash, d.created_at as drawn_at
        FROM events e
        LEFT JOIN draws d ON e.id = d.event_id
        WHERE e.id = $1;
    """
    results_query = """
        SELECT entry_id, rank, weight, cluster_id, reason_codes
        FROM draw_results
        WHERE event_id = $1
        ORDER BY rank ASC;
    """
    async with pool.acquire() as conn:
        meta_row = await conn.fetchrow(meta_query, eid)
        if not meta_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "EVENT_NOT_FOUND", "message": "Event record not found."}
            )

        rows = await conn.fetch(results_query, eid)
        rankings = [
            {
                "rank": r["rank"],
                "entry_id": r["entry_id"],
                "weight": r["weight"],
                "cluster_id": r["cluster_id"],
                "reasons": r["reason_codes"] or []
            }
            for r in rows
        ]

        return {
            "event_id": meta_row["id"],
            "capacity": meta_row["capacity"],
            "commitment": meta_row["commitment"],
            "seed_reveal": meta_row["seed_reveal"] if meta_row["state"] in ("DRAWN", "DONE") else None,
            "entries_hash": meta_row["entries_hash"],
            "total_ranked_entries": len(rankings),
            "results": rankings
        }
