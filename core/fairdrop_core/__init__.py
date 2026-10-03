"""Fair Drop Core: Pure-function anti-Sybil, weighting, and verifiable draw logic."""

from fairdrop_core.config import (
    DefenseFlags,
    DEFAULT_CAPACITY,
    DEFAULT_HOLD_TTL_SECONDS,
    DEFAULT_WINDOW_SECONDS,
    DEFAULT_MIN_ACCOUNT_AGE_SECONDS,
    DEFAULT_CLUSTER_ALPHA,
    DEFAULT_MAX_SEATS_PER_CLUSTER,
    DEFAULT_POW_DIFFICULTY_BITS,
    DEFAULT_ADMISSION_BATCH_SIZE,
    get_rank_bucket,
)
from fairdrop_core.canonical import (
    canonicalize_email,
    normalize_phone_e164,
    hash_phone,
    is_disposable_domain,
)
from fairdrop_core.pow import (
    make_challenge_payload,
    serialize_challenge,
    deserialize_challenge,
    verify_challenge,
    solve_challenge,
    count_leading_zero_bits,
)
from fairdrop_core.clustering import (
    build_clusters,
    DisjointSet,
)
from fairdrop_core.weights import (
    compute_risk_score,
    compute_weight,
)
from fairdrop_core.draw import (
    compute_commitment,
    compute_entries_hash,
    compute_draw_key,
    rank_entries,
)
from fairdrop_core.verify import (
    verify_commitment,
    verify_entries_hash,
    verify_single_entry,
    verify_full_draw,
)

__all__ = [
    "DefenseFlags",
    "DEFAULT_CAPACITY",
    "DEFAULT_HOLD_TTL_SECONDS",
    "DEFAULT_WINDOW_SECONDS",
    "DEFAULT_MIN_ACCOUNT_AGE_SECONDS",
    "DEFAULT_CLUSTER_ALPHA",
    "DEFAULT_MAX_SEATS_PER_CLUSTER",
    "DEFAULT_POW_DIFFICULTY_BITS",
    "DEFAULT_ADMISSION_BATCH_SIZE",
    "get_rank_bucket",
    "canonicalize_email",
    "normalize_phone_e164",
    "hash_phone",
    "is_disposable_domain",
    "make_challenge_payload",
    "serialize_challenge",
    "deserialize_challenge",
    "verify_challenge",
    "solve_challenge",
    "count_leading_zero_bits",
    "build_clusters",
    "DisjointSet",
    "compute_risk_score",
    "compute_weight",
    "compute_commitment",
    "compute_entries_hash",
    "compute_draw_key",
    "rank_entries",
    "verify_commitment",
    "verify_entries_hash",
    "verify_single_entry",
    "verify_full_draw",
]
