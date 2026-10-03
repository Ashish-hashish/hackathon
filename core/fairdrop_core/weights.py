"""Risk scoring and weighted allocation calculation.

Implements the core fairness equation:
    w_i = risk_multiplier_i / (cluster_size_i ^ alpha)

Ensures that extra Sybil identities give diminishing marginal returns,
while preserving legitimate user chances.
Pure functions, zero external dependencies.
"""

from typing import Dict, Any, List, Tuple
from fairdrop_core.config import DEFAULT_CLUSTER_ALPHA

# Common Datacenter / Cloud / Hosting ASNs (sample list for zero-network scoring)
KNOWN_DATACENTER_ASNS = frozenset([
    16509,  # Amazon.com
    14618,  # Amazon AWS
    15169,  # Google LLC
    396982, # Google Cloud
    8075,   # Microsoft Azure
    14061,  # DigitalOcean
    24940,  # Hetzner Online
    16276,  # OVH
    63949,  # Linode / Akamai
    20473,  # Choopa / Vultr
    36352,  # ColoCrossing
    46562,  # Total Server Solutions
    51167,  # Contabo GmbH
])


def compute_risk_score(
    entry: Dict[str, Any],
    cluster_size: int = 1,
    enabled: bool = True
) -> Tuple[float, List[str]]:
    """Computes a risk score in [0.0, 1.0] and associated audit reason codes.
    
    4 primary soft signals (Spec 13.1):
      1. Datacenter / Hosting ASN (+0.30)
      2. Header anomaly / mismatch (+0.25)
      3. Cluster size / Sybil clustering (+0.25 max)
      4. PoW solve-time outlier (+0.20)
    """
    if not enabled:
        return 0.0, []

    score = 0.0
    reasons: List[str] = []

    # Signal 1: Datacenter ASN
    asn = entry.get("asn")
    if asn is not None and (int(asn) in KNOWN_DATACENTER_ASNS or entry.get("is_datacenter")):
        score += 0.30
        reasons.append("DATACENTER_ASN")

    # Signal 2: Header anomaly
    if entry.get("header_anomaly") or entry.get("is_header_spoofed"):
        score += 0.25
        reasons.append("HEADER_ANOMALY")

    # Signal 3: Cluster size
    if cluster_size > 1:
        # Scales gently from +0.10 for size 2 up to +0.25 for large clusters
        cluster_penalty = min(0.25, 0.05 * (cluster_size - 1))
        score += cluster_penalty
        reasons.append(f"CLUSTER_SIZE_{cluster_size}")

    # Signal 4: PoW solve-time outlier (< 20ms or impossibly fast)
    solve_ms = entry.get("pow_solve_ms")
    if solve_ms is not None and solve_ms < 25:
        score += 0.20
        reasons.append("SUSPICIOUS_FAST_POW")

    clamped_score = min(1.0, max(0.0, score))
    return round(clamped_score, 4), reasons


def compute_weight(
    entry: Dict[str, Any],
    cluster_size: int = 1,
    alpha: float = DEFAULT_CLUSTER_ALPHA,
    def_cluster_weight: bool = True,
    def_risk_score: bool = True
) -> Tuple[float, float, List[str]]:
    """Calculates entry weight w_i and risk multiplier.
    
    w_i = risk_multiplier / (cluster_size ^ alpha)
    
    Returns:
        (weight, risk_score, reason_codes)
    """
    risk_score, reasons = compute_risk_score(
        entry=entry,
        cluster_size=cluster_size,
        enabled=def_risk_score
    )

    # risk_multiplier in [0.10, 1.00]
    risk_multiplier = 1.0 - (0.90 * risk_score)

    if not def_cluster_weight or cluster_size <= 1:
        effective_size = 1.0
    else:
        effective_size = float(cluster_size)

    denominator = effective_size ** alpha
    if denominator <= 0:
        denominator = 1.0

    weight = risk_multiplier / denominator
    # Ensure weight is strictly positive to prevent division by zero in draw
    clamped_weight = max(0.0001, weight)

    return clamped_weight, risk_score, reasons
