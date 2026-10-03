"""Concurrent confirmation storm and zero-oversell invariant tests.

Spec Section 5 & Acceptance Criteria Section 14:
- 2,000 concurrent confirmation attempts against 500 allocated seats
- Exactly 500 seats confirmed
- Exactly 0 duplicates
- Exactly 0 oversell
- Idempotent retries return identical cached confirmations without allocating duplicate seats
"""

import unittest
import asyncio
import time
from typing import Dict, Any, List


class MockRedisState:
    """In-memory mock reproducing the atomic Lua semantics of admit.lua and confirm.lua."""

    def __init__(self, capacity: int = 500):
        self.capacity = capacity
        self.available_inventory = capacity
        self.holds: Dict[str, Dict[str, Any]] = {}
        self.confirmed_seats: Dict[str, Dict[str, Any]] = {}
        self.cluster_seats: Dict[str, int] = {}
        self.idempotency_cache: Dict[str, str] = {}
        self.lock = asyncio.Lock()

    async def admit_user(self, identity_id: str, cluster_id: str, hold_ttl_sec: int = 180, max_seats_per_cluster: int = 1) -> bool:
        """Atomic admission mimicking admit.lua."""
        async with self.lock:
            if self.available_inventory <= 0:
                return False

            current_seats = self.cluster_seats.get(cluster_id, 0)
            if current_seats >= max_seats_per_cluster:
                return False

            self.available_inventory -= 1
            hold_id = f"hold_{identity_id}"
            now = time.time()
            self.holds[hold_id] = {
                "hold_id": hold_id,
                "identity_id": identity_id,
                "cluster_id": cluster_id,
                "status": "HELD",
                "expires_at": now + hold_ttl_sec
            }
            self.cluster_seats[cluster_id] = current_seats + 1
            return True

    async def confirm_seat(self, hold_id: str, identity_id: str, idem_key: str = None) -> tuple:
        """Atomic confirmation mimicking confirm.lua."""
        async with self.lock:
            # 1. Idempotency check
            if idem_key and idem_key in self.idempotency_cache:
                return ("IDEMPOTENT", self.idempotency_cache[idem_key])

            hold = self.holds.get(hold_id)
            if not hold:
                return ("HOLD_NOT_FOUND", "")

            if hold["identity_id"] != identity_id:
                return ("IDENTITY_MISMATCH", "")

            if hold["status"] == "CONFIRMED":
                return ("ALREADY_CONFIRMED", "")

            now = time.time()
            if hold["status"] != "HELD" or now > hold["expires_at"]:
                return ("HOLD_EXPIRED", "")

            # Mark confirmed
            hold["status"] = "CONFIRMED"
            hold["confirmed_at"] = now
            self.confirmed_seats[hold_id] = hold

            resp = f"CONFIRMED_{hold_id}"
            if idem_key:
                self.idempotency_cache[idem_key] = resp

            return ("CONFIRMED", resp)


class TestAllocationIntegrity(unittest.TestCase):

    def test_concurrent_confirm_storm(self):
        """Simulates 2,000 parallel confirm requests against 500 seats.
        
        Guarantees:
        - Exactly 500 confirmed seats
        - 0 duplicate confirmations
        - 0 oversell
        """
        async def run_storm():
            capacity = 500
            total_competitors = 2000
            state = MockRedisState(capacity=capacity)

            # 1. Admit users up to capacity
            admitted = []
            for i in range(total_competitors):
                ident = f"user_{i:04d}"
                cluster = f"cluster_{i:04d}" # Distinct clusters
                ok = await state.admit_user(ident, cluster)
                if ok:
                    admitted.append(ident)

            self.assertEqual(len(admitted), capacity)
            self.assertEqual(state.available_inventory, 0)

            # 2. Launch concurrent confirm storm with 2,000 tasks:
            # - 500 legitimate admitted users
            # - 1500 unadmitted competitors trying to brute-force or race
            confirm_tasks = []
            for i in range(total_competitors):
                ident = f"user_{i:04d}"
                hold_id = f"hold_{ident}"
                idem_key = f"key_{ident}"
                confirm_tasks.append(state.confirm_seat(hold_id, ident, idem_key))

            results = await asyncio.gather(*confirm_tasks)

            # Analyze results
            confirmed_count = sum(1 for status, _ in results if status == "CONFIRMED")
            not_found_count = sum(1 for status, _ in results if status == "HOLD_NOT_FOUND")

            self.assertEqual(confirmed_count, capacity)
            self.assertEqual(not_found_count, total_competitors - capacity)
            self.assertEqual(len(state.confirmed_seats), capacity)
            self.assertEqual(state.available_inventory, 0)

        asyncio.run(run_storm())

    def test_idempotent_retry_storm(self):
        """Users submitting identical confirm requests repeatedly receive the cached response without double-allocating."""
        async def run_retry():
            state = MockRedisState(capacity=10)
            await state.admit_user("user_1", "cluster_1")

            idem_key = "idempotency_key_abc_123"

            # First confirm
            status1, body1 = await state.confirm_seat("hold_user_1", "user_1", idem_key)
            self.assertEqual(status1, "CONFIRMED")

            # 50 duplicate retries in parallel
            retry_tasks = [
                state.confirm_seat("hold_user_1", "user_1", idem_key)
                for _ in range(50)
            ]
            retry_results = await asyncio.gather(*retry_tasks)

            for status_r, body_r in retry_results:
                self.assertEqual(status_r, "IDEMPOTENT")
                self.assertEqual(body_r, body1)

            # Only 1 confirmed seat stored
            self.assertEqual(len(state.confirmed_seats), 1)

        asyncio.run(run_retry())

    def test_cluster_cap_enforcement(self):
        """Multiple identities belonging to the same Sybil cluster cannot exceed MAX_SEATS_PER_CLUSTER."""
        async def run_cluster_test():
            state = MockRedisState(capacity=50)

            # Sybil attacker mints 10 identities all mapped to cluster_sybil_001
            sybil_cluster = "cluster_sybil_001"
            admitted_sybils = 0
            for i in range(10):
                ok = await state.admit_user(f"sybil_{i}", sybil_cluster, max_seats_per_cluster=1)
                if ok:
                    admitted_sybils += 1

            # Only 1 seat allowed per cluster
            self.assertEqual(admitted_sybils, 1)

        asyncio.run(run_cluster_test())


if __name__ == "__main__":
    unittest.main()
