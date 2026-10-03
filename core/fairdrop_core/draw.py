"""Verifiable, deterministic weighted draw using Efraimidis-Spirakis sampling.

Produces a full permutation ranking of all entries based on:
    u_i = HMAC_SHA256(seed, entry_id) in (0, 1)
    key_i = u_i ^ (1 / w_i)
Sorted by key_i descending.

Rules:
- Strictly deterministic given (seed, entries, weights).
- Zero PRNG calls (no random.random(), no np.random).
- Provably verifiable by any third party with the revealed seed.
"""

import hmac
import hashlib
import math
from typing import List, Dict, Any, Tuple


def compute_entries_hash(entry_ids: List[str]) -> str:
    """Computes SHA-256 over lexicographically sorted entry IDs.
    
    Freezes the exact list of eligible entries prior to draw.
    """
    sorted_ids = sorted(entry_ids)
    hasher = hashlib.sha256()
    for eid in sorted_ids:
        hasher.update(eid.encode("utf-8"))
        hasher.update(b"\n")
    return hasher.hexdigest()


def compute_commitment(seed: bytes | str) -> str:
    """Computes SHA-256 commitment of the secret seed."""
    raw_bytes = seed.encode("utf-8") if isinstance(seed, str) else seed
    return hashlib.sha256(raw_bytes).hexdigest()


def hmac_uniform(seed: bytes, entry_id: str) -> float:
    """Maps entry_id to a deterministic uniform float u_i in (0, 1) via HMAC-SHA256."""
    digest = hmac.new(seed, entry_id.encode("utf-8"), hashlib.sha256).digest()
    # Read as 256-bit integer
    int_val = int.from_bytes(digest, "big")
    max_val = 1 << 256
    # Avoid exact 0.0 or 1.0 to prevent math errors in log
    if int_val == 0:
        return 1.0 / max_val
    return int_val / max_val


def compute_draw_key(seed: bytes, entry_id: str, weight: float) -> Tuple[float, float, float]:
    """Calculates u_i, log_key, and key_i for Efraimidis-Spirakis weighted sampling.
    
    Returns:
        (key_i, u_i, log_key)
    """
    if weight <= 0:
        weight = 0.0001

    u_i = hmac_uniform(seed, entry_id)
    # Using log_key = ln(u_i) / w_i for numerical stability
    # Since ln(u_i) < 0, log_key < 0; larger (less negative) is better rank
    log_key = math.log(u_i) / weight
    # key_i = u_i ** (1 / w_i)
    try:
        key_i = math.exp(log_key)
    except OverflowError:
        key_i = 0.0

    return key_i, u_i, log_key


def rank_entries(
    seed: bytes | str,
    entries: List[Dict[str, Any]],
    weights: Dict[str, float]
) -> List[Dict[str, Any]]:
    """Deterministically ranks entries using weighted sampling.
    
    Args:
        seed: The committed random seed (revealed at window close).
        entries: List of entry dicts containing at least 'entry_id'.
        weights: Mapping of entry_id -> float weight w_i.

    Returns:
        Sorted list of dicts with:
        [
            {
                "rank": 1,
                "entry_id": "...",
                "weight": 1.0,
                "u_i": 0.843...,
                "key_i": 0.843...,
                "log_key": -0.17...,
                ...original entry fields...
            },
            ...
        ]
    """
    seed_bytes = seed.encode("utf-8") if isinstance(seed, str) else seed

    scored: List[Dict[str, Any]] = []
    for e in entries:
        eid = e["entry_id"]
        w = weights.get(eid, 1.0)
        key_i, u_i, log_key = compute_draw_key(seed_bytes, eid, w)

        scored_item = dict(e)
        scored_item["weight"] = w
        scored_item["u_i"] = round(u_i, 8)
        scored_item["key_i"] = key_i
        scored_item["log_key"] = log_key
        scored.append(scored_item)

    # Sort descending by log_key (identical to key_i, but numerically robust).
    # Deterministic tie-breaking on entry_id string.
    scored.sort(key=lambda x: (x["log_key"], x["entry_id"]), reverse=True)

    # Assign 1-indexed ranks
    for idx, item in enumerate(scored, start=1):
        item["rank"] = idx

    return scored
