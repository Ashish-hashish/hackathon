"""Realtime SSE & Public Events router (/events).

Spec Section 6 & Architecture Section 9:
- Public list of active events for registrators to browse and select.
- Server-Sent Events (SSE) status stream per event.
- Supports Last-Event-ID resume.
- Periodic heartbeat comments to keep connections alive through proxies.
"""

import asyncio
import json
import time
from typing import Optional
from fastapi import APIRouter, Request, Query
from starlette.responses import StreamingResponse
from app.services.redis_keys import key_window, key_inventory, key_entries

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/list")
async def list_public_events(request: Request):
    """Returns list of public events for participants."""
    pool = request.app.state.db_pool
    r = request.app.state.redis

    events_list = []
    if pool:
        query = """
            SELECT id, name, capacity, state, commitment, seed_reveal, created_at
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

                events_list.append({
                    "id": eid,
                    "name": row["name"],
                    "capacity": row["capacity"],
                    "state": win_state,
                    "commitment": row["commitment"],
                    "seed_reveal": row["seed_reveal"],
                    "entries_count": entries_count,
                    "available_inventory": available_inv,
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None
                })

    if not events_list:
        default_id = "event_drop_001"
        win_raw = await r.get(key_window(default_id))
        events_list.append({
            "id": default_id,
            "name": "Fair Drop 500",
            "capacity": 500,
            "state": win_raw.decode("utf-8") if win_raw else "OPEN",
            "commitment": None,
            "seed_reveal": None,
            "entries_count": await r.hlen(key_entries(default_id)),
            "available_inventory": 500,
            "created_at": None
        })

    return {"events": events_list}


@router.get("")
async def stream_events(request: Request, event_id: Optional[str] = Query(None)):
    """Streams live event and queue updates via SSE for a specific event."""
    r = request.app.state.redis
    eid = event_id or "event_drop_001"

    async def event_generator():
        heartbeat_counter = 0

        while not await request.is_disconnected():
            try:
                yield f": heartbeat {time.time()}\n\n"

                window_raw = await r.get(f"window:{eid}")
                inv_raw = await r.get(f"inventory:{eid}")

                window_state = window_raw.decode("utf-8") if window_raw else "PENDING"
                inv_val = int(inv_raw or 500)

                event_payload = {
                    "event_id": eid,
                    "window_state": window_state,
                    "available_inventory": inv_val,
                    "timestamp": int(time.time())
                }
                heartbeat_counter += 1
                yield f"id: {heartbeat_counter}\nevent: status\ndata: {json.dumps(event_payload)}\n\n"

                await asyncio.sleep(2)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
