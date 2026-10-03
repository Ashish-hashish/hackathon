"""Configuration flags and constants for Fair Drop.

All defense flags default to True except phone OTP which requires opt-in/allowlist.
Can be overridden at runtime or in simulations for ablation experiments.
"""

from dataclasses import dataclass, field
from typing import Dict, Any


@dataclass(frozen=True)
class DefenseFlags:
    """Toggles for anti-abuse and fairness defense layers."""
    DEF_OTP: bool = True
    DEF_OTP_PHONE: bool = False
    DEF_ACCOUNT_AGE: bool = True
    DEF_CANONICAL_DEDUPE: bool = True
    DEF_POW: bool = True
    DEF_RATE_LIMITS: bool = True
    DEF_CLUSTER_WEIGHT: bool = True
    DEF_RISK_SCORE: bool = True
    DEF_STEP_UP: bool = True
    DEF_TRUST_PROXY_HEADERS_CORRECTLY: bool = True

    def to_dict(self) -> Dict[str, bool]:
        return {
            "DEF_OTP": self.DEF_OTP,
            "DEF_OTP_PHONE": self.DEF_OTP_PHONE,
            "DEF_ACCOUNT_AGE": self.DEF_ACCOUNT_AGE,
            "DEF_CANONICAL_DEDUPE": self.DEF_CANONICAL_DEDUPE,
            "DEF_POW": self.DEF_POW,
            "DEF_RATE_LIMITS": self.DEF_RATE_LIMITS,
            "DEF_CLUSTER_WEIGHT": self.DEF_CLUSTER_WEIGHT,
            "DEF_RISK_SCORE": self.DEF_RISK_SCORE,
            "DEF_STEP_UP": self.DEF_STEP_UP,
            "DEF_TRUST_PROXY_HEADERS_CORRECTLY": self.DEF_TRUST_PROXY_HEADERS_CORRECTLY,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DefenseFlags":
        valid_keys = {
            "DEF_OTP",
            "DEF_OTP_PHONE",
            "DEF_ACCOUNT_AGE",
            "DEF_CANONICAL_DEDUPE",
            "DEF_POW",
            "DEF_RATE_LIMITS",
            "DEF_CLUSTER_WEIGHT",
            "DEF_RISK_SCORE",
            "DEF_STEP_UP",
            "DEF_TRUST_PROXY_HEADERS_CORRECTLY",
        }
        kwargs = {k: bool(v) for k, v in data.items() if k in valid_keys}
        return cls(**kwargs)

    @classmethod
    def all_off(cls) -> "DefenseFlags":
        """All defenses disabled (FCFS baseline)."""
        return cls(
            DEF_OTP=False,
            DEF_OTP_PHONE=False,
            DEF_ACCOUNT_AGE=False,
            DEF_CANONICAL_DEDUPE=False,
            DEF_POW=False,
            DEF_RATE_LIMITS=False,
            DEF_CLUSTER_WEIGHT=False,
            DEF_RISK_SCORE=False,
            DEF_STEP_UP=False,
            DEF_TRUST_PROXY_HEADERS_CORRECTLY=False,
        )


# Default system constants
DEFAULT_CAPACITY = 500
DEFAULT_HOLD_TTL_SECONDS = 180
DEFAULT_WINDOW_SECONDS = 300
DEFAULT_MIN_ACCOUNT_AGE_SECONDS = 60
DEFAULT_CLUSTER_ALPHA = 1.0
DEFAULT_MAX_SEATS_PER_CLUSTER = 1
DEFAULT_POW_DIFFICULTY_BITS = 16
DEFAULT_ADMISSION_BATCH_SIZE = 50

# Rank bucket thresholds as multipliers of capacity C:
# e.g., for capacity 500:
# [1, 2, 5, 20] -> Top C (1-500), Up to 2C (501-1000), Up to 5C (1001-2500), Up to 20C (2501-10000), Beyond (>10000)
DEFAULT_RANK_BUCKET_MULTIPLIERS = [1, 2, 5, 20]


def get_rank_bucket(rank: int, capacity: int = DEFAULT_CAPACITY, multipliers: list[int] = None) -> str:
    """Classifies an exact rank into a non-revealing bucket for live view."""
    if rank <= 0:
        return "UNKNOWN"
    if multipliers is None:
        multipliers = DEFAULT_RANK_BUCKET_MULTIPLIERS
    
    for m in multipliers:
        limit = m * capacity
        if rank <= limit:
            if m == 1:
                return f"Top {limit} (Initial Allocation)"
            return f"Top {limit} (Waitlist)"
    return f"Beyond {multipliers[-1] * capacity} (Waitlist)"
