"""PostgreSQL query functions.

Source of truth queries for identities, stream persister batch inserts,
draw results persistence, and reconciliation checks.
"""

from typing import List, Dict, Any, Optional
import json
import asyncpg


async def create_identity(
    pool: asyncpg.Pool,
    identity_id: str,
    event_id: str,
    email_canonical: str,
    phone_hash: Optional[str]
) -> Dict[str, Any]:
    """Inserts a new identity or returns existing on conflict."""
    query = """
        INSERT INTO identities (id, event_id, email_canonical, phone_hash)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (event_id, email_canonical) DO UPDATE
            SET email_canonical = EXCLUDED.email_canonical
        RETURNING id, event_id, email_canonical, phone_hash, verified_at, created_at;
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, identity_id, event_id, email_canonical, phone_hash)
        return dict(row) if row else {}


async def batch_insert_entries(pool: asyncpg.Pool, entries: List[Dict[str, Any]]) -> int:
    """Batch-inserts entries drained from Redis entry_stream into Postgres."""
    if not entries:
        return 0

    query = """
        INSERT INTO entries (
            id, event_id, identity_id, ts_server, ip_prefix, asn,
            ua_hash, hdr_hash, tls_hash, pow_solve_ms, risk_raw
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (event_id, identity_id) DO NOTHING;
    """
    records = [
        (
            e["entry_id"],
            e["event_id"],
            e["identity_id"],
            int(e["ts_server"]),
            e.get("ip_prefix"),
            str(e.get("asn", "")),
            e.get("ua_hash"),
            e.get("hdr_hash"),
            e.get("tls_hash"),
            float(e["pow_solve_ms"]) if e.get("pow_solve_ms") is not None else None,
            float(e.get("risk_raw", 0.0))
        )
        for e in entries
    ]
    async with pool.acquire() as conn:
        result = await conn.executemany(query, records)
        return len(records)


async def get_all_entries_for_draw(pool: asyncpg.Pool, event_id: str) -> List[Dict[str, Any]]:
    """Loads all entries with features from Postgres for the window close pipeline."""
    query = """
        SELECT e.id AS entry_id, e.event_id, e.identity_id, e.ts_server, e.ip_prefix,
               e.asn, e.ua_hash, e.hdr_hash, e.tls_hash, e.pow_solve_ms, e.risk_raw,
               i.email_canonical, i.phone_hash
        FROM entries e
        JOIN identities i ON e.identity_id = i.id
        WHERE e.event_id = $1
        ORDER BY e.id ASC;
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, event_id)
        return [dict(r) for r in rows]


async def save_draw_transaction(
    pool: asyncpg.Pool,
    event_id: str,
    entries_hash: str,
    seed_used: str,
    params: Dict[str, Any],
    results: List[Dict[str, Any]]
) -> None:
    """Atomically persists draw details and all entry results in one transaction."""
    draw_query = """
        INSERT INTO draws (event_id, entries_hash, seed_used, params)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (event_id) DO UPDATE
            SET entries_hash = EXCLUDED.entries_hash,
                seed_used = EXCLUDED.seed_used,
                params = EXCLUDED.params;
    """

    res_query = """
        INSERT INTO draw_results (event_id, entry_id, rank, weight, cluster_id, reason_codes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (event_id, entry_id) DO UPDATE
            SET rank = EXCLUDED.rank,
                weight = EXCLUDED.weight,
                cluster_id = EXCLUDED.cluster_id,
                reason_codes = EXCLUDED.reason_codes;
    """

    res_records = [
        (
            event_id,
            r["entry_id"],
            r["rank"],
            float(r["weight"]),
            str(r["cluster_id"]),
            json.dumps(r.get("reason_codes", []))
        )
        for r in results
    ]

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(draw_query, event_id, entries_hash, seed_used, json.dumps(params))
            await conn.executemany(res_query, res_records)


async def check_reconciliation(pool: asyncpg.Pool, event_id: str, capacity: int) -> Dict[str, Any]:
    """Verifies: confirmed + active_holds + available == capacity."""
    query = """
        SELECT
            (SELECT COUNT(*) FROM allocations WHERE event_id = $1) AS confirmed,
            (SELECT COUNT(*) FROM holds WHERE event_id = $1 AND status = 'HELD' AND expires_at > NOW()) AS active_holds;
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, event_id)
        confirmed = row["confirmed"] if row else 0
        active_holds = row["active_holds"] if row else 0
        allocated_total = confirmed + active_holds
        available = max(0, capacity - allocated_total)
        is_balanced = (allocated_total <= capacity)

        return {
            "capacity": capacity,
            "confirmed": confirmed,
            "active_holds": active_holds,
            "available": available,
            "oversell": max(0, allocated_total - capacity),
            "is_balanced": is_balanced
        }
