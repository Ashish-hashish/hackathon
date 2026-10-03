"""Independent draw verifier.

Used by the backend audit API, independent CLI scripts, and browser audit page
to mathematically prove that the draw was not manipulated.
Pure functions, zero external dependencies.
"""

from typing import List, Dict, Any, Tuple
import math
from fairdrop_core.draw import (
    compute_commitment,
    compute_entries_hash,
    compute_draw_key,
    rank_entries
)


def verify_commitment(seed: bytes | str, commitment: str) -> bool:
    """Verifies that SHA256(seed) matches the published commitment."""
    actual = compute_commitment(seed)
    return actual.lower() == commitment.strip().lower()


def verify_entries_hash(entry_ids: List[str], expected_hash: str) -> bool:
    """Verifies that the frozen list of entry IDs matches the published entries_hash."""
    actual = compute_entries_hash(entry_ids)
    return actual.lower() == expected_hash.strip().lower()


def verify_single_entry(
    seed: bytes | str,
    entry_id: str,
    weight: float,
    claimed_rank: int,
    claimed_u_i: float = None,
    tolerance: float = 1e-6
) -> Tuple[bool, Dict[str, Any]]:
    """Calculates and verifies the draw key for an individual entry."""
    seed_bytes = seed.encode("utf-8") if isinstance(seed, str) else seed
    key_i, u_i, log_key = compute_draw_key(seed_bytes, entry_id, weight)

    u_i_matches = True
    if claimed_u_i is not None:
        u_i_matches = abs(u_i - claimed_u_i) < tolerance

    return u_i_matches, {
        "entry_id": entry_id,
        "weight": weight,
        "claimed_rank": claimed_rank,
        "computed_u_i": round(u_i, 8),
        "computed_key_i": key_i,
        "computed_log_key": log_key,
        "valid": u_i_matches
    }


def verify_full_draw(
    seed: bytes | str,
    commitment: str,
    expected_entries_hash: str,
    entries: List[Dict[str, Any]],
    weights: Dict[str, float],
    claimed_ranking: List[Dict[str, Any]]
) -> Tuple[bool, str]:
    """Verifies the entire draw end-to-end: commitment, entries hash, and exact ranking order."""
    # 1. Verify commitment
    if not verify_commitment(seed, commitment):
        return False, "COMMITMENT_MISMATCH"

    # 2. Verify entries hash
    entry_ids = [e["entry_id"] for e in entries]
    if not verify_entries_hash(entry_ids, expected_entries_hash):
        return False, "ENTRIES_HASH_MISMATCH"

    # 3. Independent re-ranking
    computed_ranking = rank_entries(seed, entries, weights)

    if len(computed_ranking) != len(claimed_ranking):
        return False, f"ENTRY_COUNT_MISMATCH: expected {len(computed_ranking)}, got {len(claimed_ranking)}"

    for comp, claim in zip(computed_ranking, claimed_ranking):
        if comp["rank"] != claim["rank"]:
            return False, f"RANK_MISMATCH at rank {comp['rank']}: {comp['entry_id']} vs {claim.get('entry_id')}"
        if comp["entry_id"] != claim["entry_id"]:
            return False, f"ORDER_MISMATCH at rank {comp['rank']}: {comp['entry_id']} vs {claim.get('entry_id')}"

    return True, "VERIFICATION_SUCCESSFUL"
