"""Tests for risk score computation and cluster dilution weighting."""

import unittest
from fairdrop_core.weights import compute_risk_score, compute_weight


class TestWeights(unittest.TestCase):

    def test_clean_user_weights(self):
        entry = {
            "entry_id": "clean_user",
            "asn": 7922,  # Comcast residential
            "pow_solve_ms": 250.0,
            "header_anomaly": False,
        }
        weight, risk, reasons = compute_weight(entry, cluster_size=1)
        self.assertEqual(risk, 0.0)
        self.assertEqual(weight, 1.0)
        self.assertEqual(reasons, [])

    def test_datacenter_asn_risk(self):
        entry = {
            "entry_id": "aws_bot",
            "asn": 16509,  # AWS datacenter
            "pow_solve_ms": 100.0,
        }
        risk, reasons = compute_risk_score(entry)
        self.assertGreaterEqual(risk, 0.30)
        self.assertIn("DATACENTER_ASN", reasons)

    def test_header_anomaly_risk(self):
        entry = {
            "entry_id": "spoofer",
            "header_anomaly": True,
        }
        risk, reasons = compute_risk_score(entry)
        self.assertGreaterEqual(risk, 0.25)
        self.assertIn("HEADER_ANOMALY", reasons)

    def test_cluster_dilution_and_weight_formula(self):
        entry = {"entry_id": "sybil_node"}
        # For cluster of 10 with alpha=1.0:
        # cluster penalty = min(0.25, 0.05 * 9) = 0.25
        # risk_multiplier = 1.0 - (0.90 * 0.25) = 0.775
        # denominator = 10^1.0 = 10
        # weight = 0.775 / 10 = 0.0775
        weight, risk, reasons = compute_weight(entry, cluster_size=10, alpha=1.0)
        self.assertAlmostEqual(risk, 0.25, places=3)
        self.assertAlmostEqual(weight, 0.0775, places=4)
        self.assertIn("CLUSTER_SIZE_10", reasons)

    def test_ablation_cluster_weight_disabled(self):
        entry = {"entry_id": "sybil_node"}
        # When def_cluster_weight is False, denominator is 1.0 regardless of cluster size
        weight, risk, _ = compute_weight(
            entry,
            cluster_size=100,
            def_cluster_weight=False,
            def_risk_score=False
        )
        self.assertEqual(weight, 1.0)
        self.assertEqual(risk, 0.0)


if __name__ == "__main__":
    unittest.main()
