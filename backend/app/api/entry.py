"""Entry router and O(1) hot path.

Architecture Section 4.2:
- Challenge issuance with adaptive difficulty and account age verification.
- O(1) submission path with zero PostgreSQL database calls.
- Pure CPU PoW verification followed by a single atomic Redis Lua execution.
"""

import os
import time
import uuid
import hashlib
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Response, status, Header
from pydantic import BaseModel
from fairdrop_core.pow import (
    make_challenge_payload,
    serialize_challenge,
    verify_challenge,
    deserialize_challenge
)
from fairdrop_core.weights import compute_risk_score
from app.services.redis_keys import (
    key_session, key_window, key_entries, key_nonce,
    key_counters, key_entry_stream
)
from app.middleware.client_ip import get_client_ip, get_ip_prefix

router = APIRouter(prefix="/entry", tags=["entry"])

HMAC_SECRET = os.getenv("HMAC_SECRET_KEY", "dev-hmac-secret-at-least-32-bytes-long!")
BASE_DIFFICULTY = int(os.getenv("BASE_POW_DIFFICULTY_BITS", "12"))
MIN_ACCOUNT_AGE = int(os.getenv("MIN_ACCOUNT_AGE_SECONDS", "0"))

# Load entry.lua script
LUA_DIR = Path(__file__).resolve().parent.parent / "redis_scripts"
with open(LUA_DIR / "entry.lua", "r") as f:
    ENTRY_LUA = f.read()


class EntrySubmitRequest(BaseModel):
    challenge: str
    solution: str
    event_id: Optional[str] = None


async def get_current_session(request: Request) -> dict:
    """Helper to load and validate session from cookie or Bearer token."""
    sid = request.cookies.get("sid")
    if not sid:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            sid = auth_header[7:].strip()

    if not sid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHENTICATED", "message": "Missing session cookie or token."}
        )

    r = request.app.state.redis
    sess_data = await r.hgetall(key_session(sid))
    if not sess_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "SESSION_EXPIRED", "message": "Session expired or invalid."}
        )

    return {
        "sid": sid,
        "identity_id": sess_data[b"identity_id"].decode("utf-8") if b"identity_id" in sess_data else sess_data.get("identity_id"),
        "event_id": sess_data[b"event_id"].decode("utf-8") if b"event_id" in sess_data else sess_data.get("event_id"),
        "verified_at": int(sess_data[b"verified_at"] if b"verified_at" in sess_data else sess_data.get("verified_at", 0))
    }


@router.get("/challenge")
async def get_challenge(request: Request, event_id: Optional[str] = None):
    """Issues a stateless HMAC-signed PoW challenge for the authenticated user."""
    sess = await get_current_session(request)
    now = int(time.time())

    # If new event_id specified, bind it to session in Redis
    if event_id and event_id != sess.get("event_id"):
        r = request.app.state.redis
        await r.hset(key_session(sess["sid"]), "event_id", event_id)

    def_account_age = os.getenv("DEF_ACCOUNT_AGE", "false").lower() == "true"
    if def_account_age and MIN_ACCOUNT_AGE > 0:
        account_age = now - sess["verified_at"]
        if account_age < MIN_ACCOUNT_AGE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "ACCOUNT_TOO_NEW",
                    "message": f"Account age requirement not met. Please wait {MIN_ACCOUNT_AGE - account_age}s."
                }
            )

    difficulty = BASE_DIFFICULTY
    if request.headers.get("x-datacenter-test"):
        difficulty += 4

    payload = make_challenge_payload(
        sid=sess["sid"],
        identity_id=sess["identity_id"],
        secret=HMAC_SECRET,
        difficulty_bits=difficulty,
        ttl_seconds=300
    )
    serialized = serialize_challenge(payload)

    return {
        "challenge": serialized,
        "nonce": payload["nonce"],
        "difficulty_bits": difficulty,
        "issued_at": payload["issued_at"],
        "exp": payload["exp"]
    }


@router.post("")
async def submit_entry(body: EntrySubmitRequest, request: Request):
    """O(1) Entry hot path.
    
    1. Verify HMAC + PoW solution in CPU.
    2. Execute entry.lua atomically in Redis.
    """
    sess = await get_current_session(request)
    event_id = body.event_id or sess.get("event_id") or os.getenv("EVENT_ID", "event_drop_001")
    if body.event_id and body.event_id != sess.get("event_id"):
        r_sess = request.app.state.redis
        await r_sess.hset(key_session(sess["sid"]), "event_id", body.event_id)

    # Pure CPU verification of challenge & solution
    def_pow = os.getenv("DEF_POW", "true").lower() == "true"
    is_valid, reason = verify_challenge(
        challenge_input=body.challenge,
        solution=body.solution,
        expected_identity_id=sess["identity_id"],
        secret=HMAC_SECRET,
        enabled=def_pow
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_POW", "message": f"Proof of work verification failed: {reason}"}
        )

    # Extract client signals for features
    client_ip = get_client_ip(request)
    ip_prefix = get_ip_prefix(client_ip)
    ua_raw = request.headers.get("User-Agent", "unknown")
    ua_hash = hashlib.sha256(ua_raw.encode("utf-8")).hexdigest()[:16]
    hdr_hash = hashlib.sha256(str(sorted(request.headers.keys())).encode("utf-8")).hexdigest()[:16]

    asn = request.headers.get("x-asn", "7922")
    is_datacenter = request.headers.get("x-datacenter", "false").lower() == "true"
    header_anomaly = request.headers.get("x-header-anomaly", "false").lower() == "true"

    entry_id = f"entry_{uuid.uuid4().hex[:16]}"
    now_ms = int(time.time() * 1000)

    # Calculate risk score
    def_risk_score = os.getenv("DEF_RISK_SCORE", "true").lower() == "true"
    entry_signals = {
        "asn": asn,
        "is_datacenter": is_datacenter,
        "header_anomaly": header_anomaly,
        "pow_solve_ms": 50.0
    }
    risk_raw, reasons = compute_risk_score(
        entry=entry_signals,
        cluster_size=1,
        enabled=def_risk_score
    )

    r = request.app.state.redis
    entry_script = request.app.state.entry_script

    payload_parsed = deserialize_challenge(body.challenge)
    nonce = payload_parsed.get("nonce", "")

    keys = [
        key_window(event_id),
        key_entries(event_id),
        key_nonce(nonce),
        key_counters(event_id),
        key_entry_stream()
    ]
    args = [
        sess["identity_id"],  # ARGV[1]
        300,                  # ARGV[2]: nonce_ttl_seconds
        entry_id,             # ARGV[3]: new_entry_id
        now_ms,               # ARGV[4]: ts_server
        ip_prefix,            # ARGV[5]: ip_prefix
        asn,                  # ARGV[6]: asn
        ua_hash,              # ARGV[7]: ua_hash
        hdr_hash,             # ARGV[8]: hdr_hash
        "tls_mock",           # ARGV[9]: tls_hash
        50.0,                 # ARGV[10]: pow_solve_ms
        risk_raw,             # ARGV[11]: risk_raw
        event_id              # ARGV[12]: evt
    ]

    res = await entry_script(keys=keys, args=args)
    status_code, ret_entry_id = res[0].decode("utf-8"), res[1].decode("utf-8")

    if status_code == "WINDOW_NOT_OPEN" or status_code == "WINDOW_CLOSED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "WINDOW_NOT_OPEN", "message": "Entry window is not currently open for this event."}
        )

    return {
        "status": status_code,
        "entry_id": ret_entry_id,
        "is_existing": (status_code == "EXISTING")
    }
