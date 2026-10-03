"""Anti-Sybil clustering using Disjoint Set Union (Union-Find).

Clusters entries based on strong links (phone, email, device) and guarded soft links
(requires >= 2 matching soft signals). Never merges on shared IP/ASN alone (CGNAT-safe).
Pure functions, zero external dependencies.
"""

from typing import Dict, List, Any, Set, Tuple
from collections import defaultdict


class DisjointSet:
    """Disjoint Set Union (DSU) with path compression and union by rank."""

    def __init__(self, elements: List[str]):
        self.parent: Dict[str, str] = {x: x for x in elements}
        self.rank: Dict[str, int] = {x: 0 for x in elements}

    def find(self, x: str) -> str:
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x: str, y: str) -> bool:
        root_x = self.find(x)
        root_y = self.find(y)
        if root_x == root_y:
            return False

        if self.rank[root_x] < self.rank[root_y]:
            self.parent[root_x] = root_y
        elif self.rank[root_x] > self.rank[root_y]:
            self.parent[root_y] = root_x
        else:
            self.parent[root_y] = root_x
            self.rank[root_x] += 1
        return True


def build_clusters(
    entries: List[Dict[str, Any]],
    enabled: bool = True,
    timing_band_ms: float = 1000.0,
    pow_similarity_ms: float = 200.0
) -> Tuple[Dict[str, str], Dict[str, int]]:
    """Builds clusters across entries.
    
    Args:
        entries: List of entry dicts containing:
          - entry_id (str)
          - email_canonical (str, optional)
          - phone_hash (str, optional)
          - device_hash (str, optional)
          - ip_prefix (str, optional) e.g. /24 or /64
          - asn (int or str, optional)
          - ua_hash (str, optional)
          - hdr_hash (str, optional)
          - ts_server (float or int, optional) arrival timestamp in ms
          - pow_solve_ms (float or int, optional)
        enabled: If False, each entry is its own cluster (ablation).
        timing_band_ms: Max difference in ts_server to count as timing-correlated.
        pow_similarity_ms: Max difference in pow_solve_ms to count as timing-correlated.

    Returns:
        entry_to_cluster: mapping of entry_id -> cluster_id (root representative)
        cluster_sizes: mapping of cluster_id -> number of entries in cluster
    """
    if not entries:
        return {}, {}

    entry_ids = [e["entry_id"] for e in entries]

    if not enabled:
        # Ablation mode: every entry is in its own isolated cluster of size 1
        return {eid: eid for eid in entry_ids}, {eid: 1 for eid in entry_ids}

    dsu = DisjointSet(entry_ids)

    # 1. Strong Links: Any shared strong key directly merges entries
    # Keys: phone_hash, email_canonical, device_hash
    strong_phone: Dict[str, str] = {}
    strong_email: Dict[str, str] = {}
    strong_device: Dict[str, str] = {}

    for e in entries:
        eid = e["entry_id"]

        phone = e.get("phone_hash")
        if phone:
            if phone in strong_phone:
                dsu.union(eid, strong_phone[phone])
            else:
                strong_phone[phone] = eid

        email = e.get("email_canonical")
        if email:
            if email in strong_email:
                dsu.union(eid, strong_email[email])
            else:
                strong_email[email] = eid

        device = e.get("device_hash")
        if device:
            if device in strong_device:
                dsu.union(eid, strong_device[device])
            else:
                strong_device[device] = eid

    # 2. Soft Links: Merge ONLY when >= 2 soft signals agree
    # Signal 1: same (ip_prefix, asn)
    # Signal 2: same (ua_hash, hdr_hash)
    # Signal 3: synchronized timing (|ts_a - ts_b| <= timing_band_ms and |pow_a - pow_b| <= pow_similarity_ms)
    #
    # To avoid O(N^2) comparison across all entries, bucket by Signal 1 and Signal 2 candidates:
    
    # Group by (ip_prefix, asn)
    ip_asn_groups: Dict[Tuple[str, Any], List[Dict[str, Any]]] = defaultdict(list)
    for e in entries:
        ip = e.get("ip_prefix")
        asn = e.get("asn")
        if ip and asn is not None:
            ip_asn_groups[(ip, asn)].append(e)

    for group in ip_asn_groups.values():
        if len(group) <= 1:
            continue
        
        # Within the same IP/ASN, compare other soft signals
        # If group is small to moderate (typical for bots sharing an IP/subnet):
        for i in range(len(group)):
            ei = group[i]
            id_i = ei["entry_id"]
            ua_hdr_i = (ei.get("ua_hash"), ei.get("hdr_hash"))
            ts_i = ei.get("ts_server")
            pow_i = ei.get("pow_solve_ms")

            for j in range(i + 1, min(len(group), i + 50)):  # capped window per IP to keep O(N) bounded
                ej = group[j]
                id_j = ej["entry_id"]

                soft_signals = 1  # Already shares (ip_prefix, asn)

                # Check Signal 2: UA + Header Order Hash
                ua_hdr_j = (ej.get("ua_hash"), ej.get("hdr_hash"))
                if ua_hdr_i[0] and ua_hdr_i == ua_hdr_j:
                    soft_signals += 1

                # Check Signal 3: Synchronized timing
                ts_j = ej.get("ts_server")
                pow_j = ej.get("pow_solve_ms")
                if ts_i is not None and ts_j is not None and pow_i is not None and pow_j is not None:
                    if abs(ts_i - ts_j) <= timing_band_ms and abs(pow_i - pow_j) <= pow_similarity_ms:
                        soft_signals += 1

                # Merge only if >= 2 soft signals agree
                if soft_signals >= 2:
                    dsu.union(id_i, id_j)

    # Compile results
    entry_to_cluster: Dict[str, str] = {}
    cluster_sizes: Dict[str, int] = defaultdict(int)

    for eid in entry_ids:
        root = dsu.find(eid)
        entry_to_cluster[eid] = root
        cluster_sizes[root] += 1

    return entry_to_cluster, dict(cluster_sizes)
