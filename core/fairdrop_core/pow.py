"""Proof-of-Work (PoW) challenge creation, verification, and solver.

Uses Hashcash-style SHA-256 puzzles with HMAC-signed stateless challenges.
Defeats rapid automation and replay attacks (T1, T2, T6, T8).
Pure functions, zero external dependencies.
"""

import hmac
import hashlib
import time
import secrets
import json
import base64
from typing import Tuple, Optional, Dict, Any


def count_leading_zero_bits(digest: bytes) -> int:
    """Count consecutive leading zero bits in raw bytes."""
    zeros = 0
    for byte in digest:
        if byte == 0:
            zeros += 8
        else:
            # Count leading zeros in this single non-zero byte
            zeros += (8 - byte.bit_length())
            break
    return zeros


def make_challenge_payload(
    sid: str,
    identity_id: str,
    secret: str,
    difficulty_bits: int = 16,
    ttl_seconds: int = 300,
    issued_at: Optional[int] = None,
    nonce: Optional[str] = None
) -> Dict[str, Any]:
    """Generates a dictionary payload and HMAC signature for a PoW challenge."""
    now = int(time.time()) if issued_at is None else int(issued_at)
    exp = now + ttl_seconds
    rnd_nonce = secrets.token_hex(16) if nonce is None else nonce

    sign_data = f"{sid}:{identity_id}:{rnd_nonce}:{difficulty_bits}:{now}:{exp}".encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), sign_data, hashlib.sha256).hexdigest()

    return {
        "sid": sid,
        "identity_id": identity_id,
        "nonce": rnd_nonce,
        "difficulty_bits": difficulty_bits,
        "issued_at": now,
        "exp": exp,
        "sig": sig,
    }


def serialize_challenge(payload: Dict[str, Any]) -> str:
    """Serializes a challenge dict to an opaque URL-safe base64 string."""
    raw_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw_json).decode("utf-8")


def deserialize_challenge(challenge_str: str) -> Optional[Dict[str, Any]]:
    """Deserializes an opaque base64 challenge string into a dictionary."""
    try:
        raw_json = base64.urlsafe_b64decode(challenge_str.encode("utf-8"))
        return json.loads(raw_json.decode("utf-8"))
    except Exception:
        return None


def verify_challenge(
    challenge_input: str | Dict[str, Any],
    solution: str,
    expected_identity_id: str,
    secret: str,
    now: Optional[int] = None,
    enabled: bool = True
) -> Tuple[bool, str]:
    """Verifies a PoW challenge and its solution in O(1).
    
    Returns (is_valid, reason_code).
    """
    if not enabled:
        return True, "POW_DISABLED"

    payload = deserialize_challenge(challenge_input) if isinstance(challenge_input, str) else challenge_input
    if not payload:
        return False, "INVALID_CHALLENGE_FORMAT"

    required_keys = {"sid", "identity_id", "nonce", "difficulty_bits", "issued_at", "exp", "sig"}
    if not required_keys.issubset(payload.keys()):
        return False, "MALFORMED_CHALLENGE"

    curr_time = int(time.time()) if now is None else int(now)

    # 1. Expiry check
    if curr_time > payload["exp"]:
        return False, "CHALLENGE_EXPIRED"

    # 2. Identity match
    if payload["identity_id"] != expected_identity_id:
        return False, "IDENTITY_MISMATCH"

    # 3. HMAC signature check
    sign_data = (
        f"{payload['sid']}:{payload['identity_id']}:{payload['nonce']}:"
        f"{payload['difficulty_bits']}:{payload['issued_at']}:{payload['exp']}"
    ).encode("utf-8")
    expected_sig = hmac.new(secret.encode("utf-8"), sign_data, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_sig, payload["sig"]):
        return False, "INVALID_SIGNATURE"

    # 4. Hashcash solution check
    # Puzzle text is challenge nonce + ":" + solution
    puzzle = f"{payload['nonce']}:{solution}".encode("utf-8")
    digest = hashlib.sha256(puzzle).digest()
    zeros = count_leading_zero_bits(digest)

    if zeros < payload["difficulty_bits"]:
        return False, "INSUFFICIENT_DIFFICULTY"

    return True, "OK"


def solve_challenge(challenge_input: str | Dict[str, Any], max_iterations: int = 10_000_000) -> Optional[str]:
    """Helper solver used by Python bots, tests, and headless sim.
    
    Returns solution nonce string if found, or None if iterations exhausted.
    """
    payload = deserialize_challenge(challenge_input) if isinstance(challenge_input, str) else challenge_input
    if not payload:
        return None

    target_bits = payload["difficulty_bits"]
    nonce = payload["nonce"]

    for i in range(max_iterations):
        solution_str = str(i)
        puzzle = f"{nonce}:{solution_str}".encode("utf-8")
        digest = hashlib.sha256(puzzle).digest()
        if count_leading_zero_bits(digest) >= target_bits:
            return solution_str

    return None
