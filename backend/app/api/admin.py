"""Admin and Ops router (/admin).

Architecture Section 11 & 12 & Spec Section 2:
- Event lifecycle controls (create event, list events, open window, close window, trigger draw, manual admit).
- Live metrics & telemetry per event.
- Data seeder per event.
- Full Efraimidis-Spirakis Weighted Sampling table & mathematical breakdown per event.
- Scenario runner endpoint for Fairness Lab interactive simulations.
"""

import os
import json
import time
import uuid
import secrets
import re
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Request, Header, Query, status
from pydantic import BaseModel
from fairdrop_core.config import DefenseFlags, DEFAULT_CAPACITY
from fairdrop_core.draw import compute_commitment, hmac_uniform, compute_draw_key
from app.services.redis_keys import (
    key_window, key_inventory, key_queue, key_counters,
    key_entries, key_cluster_seats, key_hold, key_holds_exp, key_result, key_active_events
)
from app.workers.drawer import execute_draw_pipeline

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "fairdrop-admin-supersecret-token")


def verify_admin_auth(request: Request):
    """Verifies admin authorization token."""
    auth = request.headers.get("Authorization") or request.headers.get("X-Admin-Token")
    if not auth:
        return True  # Permissive in dev/demo environment
    token = auth[7:] if auth.startswith("Bearer ") else auth
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid admin token.")
    return True


class CreateEventRequest(BaseModel):
    id: Optional[str] = None
    name: str
    capacity: int = 500
    window_seconds: int = 300
    min_account_age_seconds: int = 0


class WindowControlRequest(BaseModel):
    event_id: Optional[str] = None
    capacity: Optional[int] = None


@router.get("/events")
async def list_admin_events(request: Request):
    """Lists all events with live metrics and statuses."""
    verify_admin_auth(request)
    pool = request.app.state.db_pool
    r = request.app.state.redis

    events_list = []
    if pool:
        query = """
            SELECT id, name, capacity, state, commitment, seed_reveal, params, created_at
            FROM events
            ORDER BY created_at DESC;
        """
        async with pool.acquire() as conn:
            rows = await conn.fetch(query)
            for row in rows:
                eid = row["id"]
                win_raw = await r.get(key_window(eid))
                win_state = win_raw.decode("utf-8") if win_raw else row["state"]
                inv_raw = await r.get(key_inventory(eid))
                available_inv = int(inv_raw or row["capacity"])
                entries_count = await r.hlen(key_entries(eid))
                q_len = await r.llen(key_queue(eid))

                recon_raw = await r.get(f"reconcile_status:{eid}")
                recon = json.loads(recon_raw.decode("utf-8")) if recon_raw else {}

                events_list.append({
                    "id": eid,
                    "name": row["name"],
                    "capacity": row["capacity"],
                    "state": win_state,
                    "commitment": row["commitment"],
                    "seed_reveal": row["seed_reveal"],
                    "entries_count": entries_count,
                    "available_inventory": available_inv,
                    "active_holds": recon.get("active_holds", 0),
                    "confirmed": recon.get("confirmed", 0),
                    "queue_length": q_len,
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None
                })

    if not events_list:
        default_id = os.getenv("EVENT_ID", "event_drop_001")
        default_cap = int(os.getenv("EVENT_CAPACITY", "500"))
        win_raw = await r.get(key_window(default_id))
        events_list.append({
            "id": default_id,
            "name": os.getenv("EVENT_NAME", "Fair Drop 500"),
            "capacity": default_cap,
            "state": win_raw.decode("utf-8") if win_raw else "PENDING",
            "commitment": None,
            "seed_reveal": None,
            "entries_count": await r.hlen(key_entries(default_id)),
            "available_inventory": default_cap,
            "active_holds": 0,
            "confirmed": 0,
            "queue_length": 0,
            "created_at": None
        })

    return {"events": events_list}


@router.post("/events")
async def create_event(req: CreateEventRequest, request: Request):
    """Creates a new unique drop event."""
    verify_admin_auth(request)
    pool = request.app.state.db_pool
    r = request.app.state.redis

    if req.id and req.id.strip():
        event_id = re.sub(r'[^a-zA-Z0-9_\-]', '_', req.id.strip().lower())
    else:
        slug = re.sub(r'[^a-zA-Z0-9]', '_', req.name.strip().lower())[:16]
        event_id = f"event_{slug}_{secrets.token_hex(4)}"

    await r.set(key_window(event_id), "PENDING")
    await r.set(key_inventory(event_id), req.capacity)
    await r.sadd("active_events", event_id)

    if pool:
        query = """
            INSERT INTO events (id, name, capacity, state, params, created_at)
            VALUES ($1, $2, $3, 'PENDING', $4, NOW())
            ON CONFLICT (id) DO UPDATE
                SET name = EXCLUDED.name, capacity = EXCLUDED.capacity, state = 'PENDING';
        """
        params_json = json.dumps({
            "window_seconds": req.window_seconds,
            "min_account_age_seconds": req.min_account_age_seconds
        })
        async with pool.acquire() as conn:
            await conn.execute(query, event_id, req.name, req.capacity, params_json)

    return {
        "status": "CREATED",
        "event_id": event_id,
        "name": req.name,
        "capacity": req.capacity,
        "state": "PENDING"
    }


@router.post("/event/open")
@router.post("/events/{event_id}/open")
async def open_window(
    request: Request,
    event_id: Optional[str] = None,
    req: Optional[WindowControlRequest] = None
):
    """Admin action: opens the entry window and sets cryptographic commitment."""
    verify_admin_auth(request)
    r = request.app.state.redis
    pool = request.app.state.db_pool

    eid = event_id or (req.event_id if req else None) or os.getenv("EVENT_ID", "event_drop_001")
    
    capacity = req.capacity if (req and req.capacity) else None
    if not capacity and pool:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT capacity FROM events WHERE id = $1", eid)
            if row:
                capacity = row["capacity"]
    if not capacity:
        capacity = int(os.getenv("EVENT_CAPACITY", "500"))

    secret_seed = secrets.token_hex(32)
    commitment = compute_commitment(secret_seed)

    await r.set(key_window(eid), "OPEN")
    await r.set(f"secret_seed:{eid}", secret_seed)
    await r.set(f"commitment:{eid}", commitment)
    await r.set(key_inventory(eid), capacity)
    await r.sadd("active_events", eid)

    if pool:
        query = """
            INSERT INTO events (id, name, capacity, state, commitment, created_at)
            VALUES ($1, $2, $3, 'OPEN', $4, NOW())
            ON CONFLICT (id) DO UPDATE
                SET state = 'OPEN', commitment = EXCLUDED.commitment, capacity = EXCLUDED.capacity;
        """
        async with pool.acquire() as conn:
            await conn.execute(query, eid, f"Event {eid}", capacity, commitment)

    return {
        "status": "OPEN",
        "event_id": eid,
        "capacity": capacity,
        "commitment": commitment
    }


@router.post("/event/close")
@router.post("/events/{event_id}/close")
async def close_window(
    request: Request,
    event_id: Optional[str] = None,
    req: Optional[WindowControlRequest] = None
):
    """Admin action: closes the entry window."""
    verify_admin_auth(request)
    r = request.app.state.redis
    pool = request.app.state.db_pool
    eid = event_id or (req.event_id if req else None) or os.getenv("EVENT_ID", "event_drop_001")

    await r.set(key_window(eid), "CLOSED")
    if pool:
        async with pool.acquire() as conn:
            await conn.execute("UPDATE events SET state = 'CLOSED' WHERE id = $1;", eid)

    return {"status": "CLOSED", "event_id": eid}


@router.post("/event/draw")
@router.post("/events/{event_id}/draw")
async def trigger_draw(
    request: Request,
    event_id: Optional[str] = None,
    req: Optional[WindowControlRequest] = None
):
    """Admin action: executes the verifiable draw pipeline on demand."""
    verify_admin_auth(request)
    r = request.app.state.redis
    pool = request.app.state.db_pool
    eid = event_id or (req.event_id if req else None) or os.getenv("EVENT_ID", "event_drop_001")

    capacity = req.capacity if (req and req.capacity) else None
    if not capacity and pool:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT capacity FROM events WHERE id = $1", eid)
            if row:
                capacity = row["capacity"]
    if not capacity:
        capacity = int(os.getenv("EVENT_CAPACITY", "500"))

    seed_raw = await r.get(f"secret_seed:{eid}")
    seed_secret = seed_raw.decode("utf-8") if seed_raw else secrets.token_hex(32)

    result = await execute_draw_pipeline(
        r=r,
        pool=pool,
        event_id=eid,
        seed_secret=seed_secret,
        capacity=capacity
    )
    return result


@router.get("/events/{event_id}/sampling-table")
@router.get("/sampling-table")
async def get_sampling_table(request: Request, event_id: Optional[str] = None):
    """Returns the full Efraimidis-Spirakis Weighted Sampling table & mathematical metrics."""
    verify_admin_auth(request)
    pool = request.app.state.db_pool
    r = request.app.state.redis
    eid = event_id or request.query_params.get("event_id") or os.getenv("EVENT_ID", "event_drop_001")

    if not pool:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    # 1. Fetch event metadata
    meta_query = """
        SELECT e.id, e.name, e.capacity, e.state, e.commitment, e.seed_reveal, d.entries_hash, d.params, d.created_at as drawn_at
        FROM events e
        LEFT JOIN draws d ON e.id = d.event_id
        WHERE e.id = $1;
    """
    async with pool.acquire() as conn:
        meta = await conn.fetchrow(meta_query, eid)
        if not meta:
            raise HTTPException(status_code=404, detail="Event not found.")

        # 2. Fetch all draw results joined with entries and identities
        results_query = """
            SELECT r.rank, r.entry_id, r.weight, r.cluster_id, r.reason_codes,
                   e.identity_id, e.ts_server, e.ip_prefix, e.asn, e.ua_hash, e.pow_solve_ms, e.risk_raw,
                   i.email_canonical
            FROM draw_results r
            JOIN entries e ON r.event_id = e.event_id AND r.entry_id = e.id
            JOIN identities i ON e.identity_id = i.id
            WHERE r.event_id = $1
            ORDER BY r.rank ASC;
        """
        rows = await conn.fetch(results_query, eid)

    capacity = meta["capacity"] or 500
    seed_str = meta["seed_reveal"] or ""
    seed_bytes = seed_str.encode("utf-8") if seed_str else b"unrevealed_seed"

    cluster_seat_counts: Dict[str, int] = {}
    ranked_entries = []
    admitted_count = 0
    skipped_cluster_count = 0
    waitlisted_count = 0
    legit_winners = 0
    bot_winners = 0
    total_bots = 0
    total_legit = 0

    for row in rows:
        eid_str = row["entry_id"]
        w = float(row["weight"])
        c_id = row["cluster_id"]
        email = row["email_canonical"] or ""
        asn_str = str(row["asn"] or "")
        risk_raw = float(row["risk_raw"] or 0.0)

        # Detect bot identity
        is_bot = ('bot' in email.lower()) or (asn_str in ('14618', '16509')) or (risk_raw > 0.4)
        if is_bot:
            total_bots += 1
        else:
            total_legit += 1

        # Compute sampling keys
        key_i, u_i, log_key = compute_draw_key(seed_bytes, eid_str, w)

        # Determine allocation outcome status
        rank = row["rank"]
        if rank <= capacity:
            current_cluster_count = cluster_seat_counts.get(c_id, 0)
            if current_cluster_count >= 1:
                status_label = "SKIPPED_CLUSTER_CAP"
                skipped_cluster_count += 1
            else:
                status_label = "ADMITTED_WINNER"
                cluster_seat_counts[c_id] = current_cluster_count + 1
                admitted_count += 1
                if is_bot:
                    bot_winners += 1
                else:
                    legit_winners += 1
        else:
            status_label = "WAITLISTED"
            waitlisted_count += 1

        reasons = []
        if row["reason_codes"]:
            try:
                reasons = json.loads(row["reason_codes"]) if isinstance(row["reason_codes"], str) else row["reason_codes"]
            except Exception:
                reasons = []

        ranked_entries.append({
            "rank": rank,
            "entry_id": eid_str,
            "identity_id": row["identity_id"],
            "email_canonical": email,
            "is_bot": is_bot,
            "ip_prefix": row["ip_prefix"],
            "asn": asn_str,
            "cluster_id": c_id,
            "weight": round(w, 4),
            "u_i": round(u_i, 8),
            "key_i": round(key_i, 6),
            "log_key": round(log_key, 6),
            "status": status_label,
            "reason_codes": reasons,
            "ts_server": row["ts_server"],
            "pow_solve_ms": row["pow_solve_ms"]
        })

    # Summary analytics
    total_entries = len(ranked_entries)
    bot_traffic_share_pct = round((total_bots / max(1, total_entries)) * 100.0, 1)
    bot_win_share_pct = round((bot_winners / max(1, admitted_count)) * 100.0, 1)
    legit_win_share_pct = round((legit_winners / max(1, admitted_count)) * 100.0, 1)

    return {
        "event_id": eid,
        "event_name": meta["name"],
        "state": meta["state"],
        "capacity": capacity,
        "commitment": meta["commitment"],
        "seed_reveal": meta["seed_reveal"],
        "entries_hash": meta["entries_hash"],
        "drawn_at": meta["drawn_at"].isoformat() if meta["drawn_at"] else None,
        "summary": {
            "total_entries": total_entries,
            "admitted_winners": admitted_count,
            "waitlisted": waitlisted_count,
            "skipped_cluster_cap": skipped_cluster_count,
            "total_bots": total_bots,
            "total_legit": total_legit,
            "bot_winners": bot_winners,
            "legit_winners": legit_winners,
            "bot_traffic_share_pct": bot_traffic_share_pct,
            "bot_win_share_pct": bot_win_share_pct,
            "legit_win_share_pct": legit_win_share_pct,
        },
        "math_formula": {
            "uniform_hash": "u_i = HMAC_SHA256(seed, entry_id) in (0, 1)",
            "weight_formula": "w_i = risk_multiplier_i / (cluster_size_i ^ alpha)",
            "key_formula": "key_i = u_i ^ (1 / w_i)",
            "sort_order": "Descending by key_i (Efraimidis-Spirakis weighted lottery)"
        },
        "entries": ranked_entries
    }


@router.post("/events/{event_id}/reset")
async def reset_event(event_id: str, request: Request):
    """Resets an event back to PENDING state and cleans test entries/holds."""
    verify_admin_auth(request)
    r = request.app.state.redis
    pool = request.app.state.db_pool

    capacity = 500
    if pool:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT capacity FROM events WHERE id = $1", event_id)
            if row:
                capacity = row["capacity"]
            await conn.execute("DELETE FROM draw_results WHERE event_id = $1;", event_id)
            await conn.execute("DELETE FROM draws WHERE event_id = $1;", event_id)
            await conn.execute("DELETE FROM allocations WHERE event_id = $1;", event_id)
            await conn.execute("DELETE FROM holds WHERE event_id = $1;", event_id)
            await conn.execute("DELETE FROM entries WHERE event_id = $1;", event_id)
            await conn.execute("DELETE FROM identities WHERE event_id = $1;", event_id)
            await conn.execute("UPDATE events SET state = 'PENDING', commitment = NULL, seed_reveal = NULL WHERE id = $1;", event_id)

    await r.set(key_window(event_id), "PENDING")
    await r.set(key_inventory(event_id), capacity)
    await r.delete(key_entries(event_id))
    await r.delete(key_queue(event_id))
    await r.delete(key_result(event_id))
    await r.delete(key_cluster_seats(event_id))
    await r.delete(key_holds_exp(event_id))
    await r.delete(f"secret_seed:{event_id}")
    await r.delete(f"commitment:{event_id}")
    await r.delete(f"reconcile_status:{event_id}")

    return {"status": "RESET", "event_id": event_id}


@router.get("/metrics")
async def get_metrics(request: Request, event_id: Optional[str] = Query(None)):
    """Live metrics for Ops dashboard."""
    r = request.app.state.redis
    pool = request.app.state.db_pool
    eid = event_id or os.getenv("EVENT_ID", "event_drop_001")
    
    capacity = 500
    if pool:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT capacity FROM events WHERE id = $1", eid)
            if row:
                capacity = row["capacity"]
    if not capacity:
        capacity = int(os.getenv("EVENT_CAPACITY", "500"))

    window_state_raw = await r.get(key_window(eid))
    window_state = window_state_raw.decode("utf-8") if window_state_raw else "PENDING"

    entries_count = await r.hlen(key_entries(eid))
    inv_raw = await r.get(key_inventory(eid))
    available_inv = int(inv_raw or capacity)

    queue_length = await r.llen(key_queue(eid))

    reconcile_report_raw = await r.get(f"reconcile_status:{eid}")
    reconcile_report = json.loads(reconcile_report_raw.decode("utf-8")) if reconcile_report_raw else {
        "is_healthy": True,
        "confirmed": 0,
        "active_holds": 0,
        "available": available_inv,
        "oversell": 0
    }

    return {
        "event_id": eid,
        "window_state": window_state,
        "capacity": capacity,
        "entries_count": entries_count,
        "queue_length": queue_length,
        "inventory": {
            "capacity": capacity,
            "available": available_inv,
            "active_holds": reconcile_report.get("active_holds", 0),
            "confirmed": reconcile_report.get("confirmed", 0),
            "oversell": reconcile_report.get("oversell", 0)
        },
        "reconciliation": reconcile_report
    }


class ScenarioRunRequest(BaseModel):
    total_users: Optional[int] = 5000
    capacity: Optional[int] = 500
    bot_share: Optional[float] = 0.20
    identities_per_bot: Optional[int] = 10
    seed: Optional[str] = None
    flags: Optional[Dict[str, bool]] = None


@router.post("/scenario/run")
async def run_scenario(req: ScenarioRunRequest, request: Request):
    """Executes a real simulation scenario for the Fairness Lab dashboard."""
    from sim.headless.simulate import run_headless_simulation
    from fairdrop_core.config import DefenseFlags

    defense_flags = DefenseFlags.from_dict(req.flags) if req.flags else DefenseFlags()

    result = run_headless_simulation(
        total_users=req.total_users or 5000,
        capacity=req.capacity or 500,
        bot_share=req.bot_share or 0.20,
        identities_per_bot=req.identities_per_bot or 10,
        flags=defense_flags,
        seed=req.seed
    )
    return result


class SeedRequest(BaseModel):
    event_id: Optional[str] = None
    count: Optional[int] = 100
    bot_percentage: Optional[int] = 20


@router.post("/seed")
@router.post("/events/{event_id}/seed")
async def seed_data(
    request: Request,
    event_id: Optional[str] = None,
    req: Optional[SeedRequest] = None
):
    """Data seeder: creates realistic identities & entries for live drop testing."""
    verify_admin_auth(request)
    r = request.app.state.redis
    pool = request.app.state.db_pool

    eid = event_id or (req.event_id if req else None) or os.getenv("EVENT_ID", "event_drop_001")
    count = req.count if (req and req.count) else 100
    bot_pct = req.bot_percentage if (req and req.bot_percentage is not None) else 20

    capacity = 500
    if pool:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT capacity FROM events WHERE id = $1", eid)
            if row:
                capacity = row["capacity"]
    if not capacity:
        capacity = int(os.getenv("EVENT_CAPACITY", "500"))

    secret_seed = secrets.token_hex(32)
    commitment = compute_commitment(secret_seed)

    win_raw = await r.get(key_window(eid))
    if not win_raw:
        await r.set(key_window(eid), "OPEN")
        await r.set(f"secret_seed:{eid}", secret_seed)
        await r.set(f"commitment:{eid}", commitment)
        await r.set(key_inventory(eid), capacity)
        await r.sadd("active_events", eid)

    if pool:
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO events (id, name, capacity, state, commitment, created_at)
                VALUES ($1, $2, $3, 'OPEN', $4, NOW())
                ON CONFLICT (id) DO UPDATE SET state = CASE WHEN events.state = 'PENDING' THEN 'OPEN' ELSE events.state END;
            """, eid, f"Event {eid}", capacity, commitment)

    now_ms = int(time.time() * 1000)
    bot_cutoff = int(count * (bot_pct / 100.0))

    created_identities = []
    created_entries = []
    skipped = 0

    for i in range(count):
        is_bot = (i < bot_cutoff)
        ident_id = f"ident_seed_{uuid.uuid4().hex[:12]}"

        if is_bot:
            email = f"bot_{uuid.uuid4().hex[:8]}@protonmail.com"
            phone_hash = f"hash_bot_{uuid.uuid4().hex[:8]}"
            ip = f"198.51.{(i % 100)}.{(i % 50)}"
            asn = "14618"  # Datacenter ASN (AWS)
            ua_hash = "bot_fast_ua_fingerprint"
            hdr_hash = "bot_headers"
            solve_ms = 15.0
            risk = 0.55
        else:
            email = f"user_{uuid.uuid4().hex[:8]}@example.com"
            phone_hash = f"phone_hash_{uuid.uuid4().hex[:8]}"
            ip = f"192.168.{i % 250}.{(i * 7) % 250}"
            asn = "7922"  # Comcast ISP
            ua_hash = f"ua_mac_chrome_{i % 10}"
            hdr_hash = f"hdr_standard_{i % 5}"
            solve_ms = 220.0
            risk = 0.0

        entry_id = f"entry_seed_{uuid.uuid4().hex[:12]}"

        if pool:
            async with pool.acquire() as conn:
                row = await conn.fetchrow("""
                    INSERT INTO identities (id, event_id, email_canonical, phone_hash, verified_at)
                    VALUES ($1, $2, $3, $4, NOW() - INTERVAL '10 minutes')
                    ON CONFLICT (event_id, email_canonical) DO NOTHING
                    RETURNING id;
                """, ident_id, eid, email, phone_hash)

                if row is None:
                    skipped += 1
                    continue

        await r.hset(key_entries(eid), ident_id, entry_id)

        if pool:
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO entries (
                        id, event_id, identity_id, ts_server, ip_prefix, asn,
                        ua_hash, hdr_hash, tls_hash, pow_solve_ms, risk_raw
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT (event_id, identity_id) DO NOTHING;
                """, entry_id, eid, ident_id, now_ms + i * 50, f"{ip}/24", asn,
                ua_hash, hdr_hash, "tls_standard", solve_ms, risk)

        created_identities.append(ident_id)
        created_entries.append(entry_id)

    return {
        "status": "SEEDED",
        "event_id": eid,
        "seeded_count": len(created_entries),
        "requested_count": count,
        "bot_share_pct": bot_pct,
        "skipped": skipped,
        "sample_identities": created_identities[:5]
    }
