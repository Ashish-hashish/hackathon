"""Tests for verifiable draw, deterministic weighted ranking, and independent verifier."""

import unittest
import hashlib
from fairdrop_core.draw import (
    compute_commitment,
    compute_entries_hash,
    rank_entries,
)
from fairdrop_core.verify import (
    verify_commitment,
    verify_entries_hash,
    verify_single_entry,
    verify_full_draw,
)


class TestDrawAndVerify(unittest.TestCase):

    def setUp(self):
        self.seed = b"super-secret-random-draw-seed-2026-fairdrop"
        self.commitment = compute_commitment(self.seed)
        self.entries = [{"entry_id": f"entry_{i:04d}"} for i in range(100)]
        self.weights = {f"entry_{i:04d}": 1.0 for i in range(100)}

    def test_commitment_verification(self):
        self.assertTrue(verify_commitment(self.seed, self.commitment))
        self.assertFalse(verify_commitment(b"wrong-seed", self.commitment))

    def test_entries_hash_verification(self):
        entry_ids = [e["entry_id"] for e in self.entries]
        frozen_hash = compute_entries_hash(entry_ids)
        self.assertTrue(verify_entries_hash(entry_ids, frozen_hash))
        
        # Tampered entry list fails
        tampered_ids = entry_ids[:-1] + ["injected_entry_9999"]
        self.assertFalse(verify_entries_hash(tampered_ids, frozen_hash))

    def test_draw_strict_determinism(self):
        """Crucial requirement: Draw produces identical rankings across runs."""
        run1 = rank_entries(self.seed, self.entries, self.weights)
        run2 = rank_entries(self.seed, self.entries, self.weights)

        self.assertEqual(len(run1), len(run2))
        for r1, r2 in zip(run1, run2):
            self.assertEqual(r1["rank"], r2["rank"])
            self.assertEqual(r1["entry_id"], r2["entry_id"])
            self.assertEqual(r1["key_i"], r2["key_i"])

    def test_weighted_sampling_advantage(self):
        """Higher weight entries have a much higher probability of receiving top ranks."""
        # 1 high weight entry vs 99 low weight entries
        weights = {f"entry_{i:04d}": 0.05 for i in range(100)}
        weights["entry_0042"] = 50.0  # 1000x higher weight

        high_weight_top_5_wins = 0
        trials = 30
        for trial in range(trials):
            trial_seed = f"seed_trial_{trial}".encode("utf-8")
            ranking = rank_entries(trial_seed, self.entries, weights)
            top_5_ids = {r["entry_id"] for r in ranking[:5]}
            if "entry_0042" in top_5_ids:
                high_weight_top_5_wins += 1

        # With 1000x higher weight, it should be in top 5 almost every single time
        self.assertGreaterEqual(high_weight_top_5_wins, 25)

    def test_full_draw_verification_success(self):
        entry_ids = [e["entry_id"] for e in self.entries]
        entries_hash = compute_entries_hash(entry_ids)
        ranking = rank_entries(self.seed, self.entries, self.weights)

        is_valid, msg = verify_full_draw(
            seed=self.seed,
            commitment=self.commitment,
            expected_entries_hash=entries_hash,
            entries=self.entries,
            weights=self.weights,
            claimed_ranking=ranking
        )
        self.assertTrue(is_valid)
        self.assertEqual(msg, "VERIFICATION_SUCCESSFUL")

    def test_full_draw_verification_detects_tampering(self):
        entry_ids = [e["entry_id"] for e in self.entries]
        entries_hash = compute_entries_hash(entry_ids)
        ranking = rank_entries(self.seed, self.entries, self.weights)

        # Adversary swaps rank 1 and rank 2
        tampered_ranking = list(ranking)
        tampered_ranking[0], tampered_ranking[1] = tampered_ranking[1], tampered_ranking[0]

        is_valid, msg = verify_full_draw(
            seed=self.seed,
            commitment=self.commitment,
            expected_entries_hash=entries_hash,
            entries=self.entries,
            weights=self.weights,
            claimed_ranking=tampered_ranking
        )
        self.assertFalse(is_valid)
        self.assertTrue("MISMATCH" in msg)

    def test_single_entry_verifier(self):
        ranking = rank_entries(self.seed, self.entries, self.weights)
        top_entry = ranking[0]
        
        is_valid, audit_data = verify_single_entry(
            seed=self.seed,
            entry_id=top_entry["entry_id"],
            weight=top_entry["weight"],
            claimed_rank=top_entry["rank"],
            claimed_u_i=top_entry["u_i"]
        )
        self.assertTrue(is_valid)
        self.assertTrue(audit_data["valid"])


if __name__ == "__main__":
    unittest.main()
