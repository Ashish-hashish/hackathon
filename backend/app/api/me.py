"""User state router (/me).

Architecture Section 9:
- Server-authoritative state for the authenticated user.
- While drop is live, returns rank bucket (e.g. Top 500, Top 1000 Waitlist), NEVER exact rank.
- Exposes hold expiration countdown derived strictly from server's expires_at.
- Polling-friendly with tiny response payloads and jitter guidance.
"""

import json
import time
import os
from typing import Optional
from fastapi import APIRouter, Request, Query
from fairdrop_core.config import get_rank_bucket, DEFAULT_CAPACITY
from app.services.redis_keys import (
    key_window, key_entries, key_result, key_hold
)
from app.api.entry import get_current_session

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
async def get_my_status(request: Request, event_id: Optional[str] = Query(None)):
    """Returns current user status, bucketed rank, and hold countdown."""
    sess = await get_current_session(request)
    identity_id = sess["identity_id"]
    session_eid = sess.get("event_id")
    
    # If event_id is explicitly passed, use it; otherwise fallback to session_eid
    eid = event_id or session_eid or os.getenv("EVENT_ID", "event_drop_001")

    pool = request.app.state.db_pool
    capacity = 500
    event_name = "Fair Drop Event"
    if pool:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT name, capacity FROM events WHERE id = $1", eid)
            if row:
                event_name = row["name"]
                capacity = row["capacity"]

    if not capacity:
        capacity = int(os.getenv("EVENT_CAPACITY", str(DEFAULT_CAPACITY)))

    r = request.app.state.redis
    now_sec = int(time.time())

    # 1. Check window state
    window_state_raw = await r.get(key_window(eid))
    window_state = window_state_raw.decode("utf-8") if window_state_raw else "PENDING"

    # Account-age gate evaluation
    def_account_age = os.getenv("DEF_ACCOUNT_AGE", "false").lower() == "true"
    min_account_age = int(os.getenv("MIN_ACCOUNT_AGE_SECONDS", "0"))
    account_age = now_sec - sess.get("verified_at", 0)
    is_age_eligible = True
    age_remaining = 0
    if def_account_age and account_age < min_account_age:
        is_age_eligible = False
        age_remaining = max(0, min_account_age - account_age)

    # 2. Check if entered in the requested eid
    entry_id_raw = await r.hget(key_entries(eid), identity_id)

    if not entry_id_raw:
        return {
            "status": "REGISTERED",
            "identity_id": identity_id,
            "event_id": eid,
            "event_name": event_name,
            "window_state": window_state,
            "entry_id": None,
            "is_account_age_eligible": is_age_eligible,
            "account_age_remaining_seconds": age_remaining
        }

    entry_id = entry_id_raw.decode("utf-8") if isinstance(entry_id_raw, bytes) else entry_id_raw

    # 3. Check draw result if available
    raw_res = await r.hget(key_result(eid), identity_id)
    if not raw_res:
        return {
            "status": "ENTERED",
            "identity_id": identity_id,
            "event_id": eid,
            "event_name": event_name,
            "window_state": window_state,
            "entry_id": entry_id
        }

    res = json.loads(raw_res.decode("utf-8") if isinstance(raw_res, bytes) else raw_res)
    current_status = res.get("status", "DRAWN")
    rank = int(res.get("rank", 0))
    bucket = get_rank_bucket(rank, capacity)

    # 4. Check Hold details if ADMITTED
    hold_info = None
    if current_status == "ADMITTED" or res.get("hold_id"):
        hold_id = res.get("hold_id")
        hold_data = await r.hgetall(key_hold(eid, hold_id))
        if hold_data:
            hold_status = hold_data[b"status"].decode("utf-8") if b"status" in hold_data else hold_data.get("status")
            expires_at = int(hold_data[b"expires_at"] if b"expires_at" in hold_data else hold_data.get("expires_at", 0))
            rem_sec = max(0, expires_at - now_sec)

            hold_info = {
                "hold_id": hold_id,
                "status": hold_status,
                "expires_at": expires_at,
                "remaining_seconds": rem_sec
            }
            if hold_status == "EXPIRED" or rem_sec == 0:
                current_status = "EXPIRED"
            elif hold_status == "CONFIRMED":
                current_status = "CONFIRMED"

    display_rank = rank if window_state == "DONE" else None

    return {
        "status": current_status,
        "identity_id": identity_id,
        "event_id": eid,
        "event_name": event_name,
        "entry_id": entry_id,
        "window_state": window_state,
        "rank_bucket": bucket,
        "exact_rank": display_rank,
        "hold": hold_info
    }
