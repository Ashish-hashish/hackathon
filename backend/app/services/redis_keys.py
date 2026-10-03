"""Centralized Redis key builder module for Fair Drop.

Enforces Architecture Section 5 naming conventions across all services,
Lua scripts, and worker roles.
"""

def key_active_events() -> str:
    return "active_events"

def key_window(event_id: str) -> str:
    return f"window:{event_id}"

def key_entries(event_id: str) -> str:
    return f"entries:{event_id}"

def key_entry_stream() -> str:
    return "entry_stream"

def key_nonce(nonce: str) -> str:
    return f"nonce:{nonce}"

def key_ratelimit(dim: str, target: str) -> str:
    return f"rl:{dim}:{target}"

def key_session(sid: str) -> str:
    return f"sess:{sid}"

def key_otp(identity_key: str) -> str:
    return f"otp:{identity_key}"

def key_inventory(event_id: str) -> str:
    return f"inventory:{event_id}"

def key_queue(event_id: str) -> str:
    return f"queue:{event_id}"

def key_result(event_id: str) -> str:
    return f"result:{event_id}"

def key_hold(event_id: str, hold_id: str) -> str:
    return f"hold:{event_id}:{hold_id}"

def key_holds_exp(event_id: str) -> str:
    return f"holds_exp:{event_id}"

def key_cluster_seats(event_id: str) -> str:
    return f"cluster_seats:{event_id}"

def key_idem(key: str) -> str:
    return f"idem:{key}"

def key_metrics(event_id: str, second_epoch: int) -> str:
    return f"metrics:{event_id}:{second_epoch}"

def key_events_channel(event_id: str) -> str:
    return f"events:{event_id}"

def key_counters(event_id: str) -> str:
    return f"counters:{event_id}"

def key_seat_log() -> str:
    return "seat_log"

def key_leader_lock(role: str) -> str:
    return f"lock:{role}"
