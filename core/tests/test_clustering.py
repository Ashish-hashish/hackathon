"""Tests for clustering and anti-Sybil graph merging."""

import unittest
from fairdrop_core.clustering import build_clusters, DisjointSet


class TestClustering(unittest.TestCase):

    def test_disjoint_set_union(self):
        dsu = DisjointSet(["a", "b", "c", "d"])
        self.assertNotEqual(dsu.find("a"), dsu.find("b"))
        dsu.union("a", "b")
        self.assertEqual(dsu.find("a"), dsu.find("b"))
        dsu.union("b", "c")
        self.assertEqual(dsu.find("a"), dsu.find("c"))
        self.assertNotEqual(dsu.find("a"), dsu.find("d"))

    def test_strong_links_merging(self):
        entries = [
            {"entry_id": "e1", "phone_hash": "phone_AAA", "email_canonical": "u1@gmail.com"},
            {"entry_id": "e2", "phone_hash": "phone_AAA", "email_canonical": "u2@gmail.com"},
            {"entry_id": "e3", "device_hash": "dev_XYZ", "email_canonical": "u2@gmail.com"},
            {"entry_id": "e4", "device_hash": "dev_XYZ", "phone_hash": "phone_BBB"},
            {"entry_id": "e_isolated", "phone_hash": "phone_CCC", "email_canonical": "u9@gmail.com"},
        ]
        clusters, sizes = build_clusters(entries)

        # e1, e2, e3, e4 should all merge transitively into one cluster of size 4
        c1 = clusters["e1"]
        self.assertEqual(clusters["e2"], c1)
        self.assertEqual(clusters["e3"], c1)
        self.assertEqual(clusters["e4"], c1)
        self.assertEqual(sizes[c1], 4)

        # e_isolated should be separate
        c_iso = clusters["e_isolated"]
        self.assertNotEqual(c_iso, c1)
        self.assertEqual(sizes[c_iso], 1)

    def test_cgnat_isolation_shared_ip_alone_does_not_merge(self):
        """CRITICAL: Users on the same campus or CGNAT sharing IP/ASN MUST NOT merge."""
        entries = [
            {
                "entry_id": "student_1",
                "ip_prefix": "198.51.100.0/24",
                "asn": 12345,
                "ua_hash": "chrome_desktop_mac",
                "hdr_hash": "hdr_order_A",
                "ts_server": 1000.0,
                "pow_solve_ms": 250.0
            },
            {
                "entry_id": "student_2",
                "ip_prefix": "198.51.100.0/24",  # Same IP
                "asn": 12345,                   # Same ASN
                "ua_hash": "safari_iphone_ios",  # DIFFERENT UA
                "hdr_hash": "hdr_order_B",      # DIFFERENT headers
                "ts_server": 4500.0,            # DIFFERENT arrival time (> 1000ms)
                "pow_solve_ms": 800.0           # DIFFERENT solve time
            }
        ]
        clusters, sizes = build_clusters(entries)
        self.assertNotEqual(clusters["student_1"], clusters["student_2"])
        self.assertEqual(sizes[clusters["student_1"]], 1)
        self.assertEqual(sizes[clusters["student_2"]], 1)

    def test_soft_links_bot_ring_merging(self):
        """Bot ring sharing IP + ASN AND matching UA/header fingerprints MUST merge."""
        entries = [
            {
                "entry_id": "bot_1",
                "ip_prefix": "203.0.113.0/24",
                "asn": 9999,
                "ua_hash": "python_requests_bot",
                "hdr_hash": "hdr_hash_minimal",
                "ts_server": 1000.0,
                "pow_solve_ms": 50.0
            },
            {
                "entry_id": "bot_2",
                "ip_prefix": "203.0.113.0/24",
                "asn": 9999,
                "ua_hash": "python_requests_bot",  # MATCHING UA
                "hdr_hash": "hdr_hash_minimal",   # MATCHING headers
                "ts_server": 2000.0,
                "pow_solve_ms": 48.0
            }
        ]
        clusters, sizes = build_clusters(entries)
        self.assertEqual(clusters["bot_1"], clusters["bot_2"])
        c_root = clusters["bot_1"]
        self.assertEqual(sizes[c_root], 2)

    def test_soft_links_synchronized_timing_merging(self):
        """Bot ring sharing IP + ASN AND tight synchronized burst timing MUST merge."""
        entries = [
            {
                "entry_id": "burst_1",
                "ip_prefix": "192.0.2.0/24",
                "asn": 5555,
                "ua_hash": "ua_1",
                "hdr_hash": "hdr_1",
                "ts_server": 5000.0,
                "pow_solve_ms": 120.0
            },
            {
                "entry_id": "burst_2",
                "ip_prefix": "192.0.2.0/24",
                "asn": 5555,
                "ua_hash": "ua_2",
                "hdr_hash": "hdr_2",
                "ts_server": 5050.0,              # delta = 50ms (within 1000ms)
                "pow_solve_ms": 125.0             # delta = 5ms (within 200ms)
            }
        ]
        clusters, sizes = build_clusters(entries)
        self.assertEqual(clusters["burst_1"], clusters["burst_2"])

    def test_ablation_mode_disabled(self):
        # Even with strong identical links, disabled clustering keeps each entry isolated
        entries = [
            {"entry_id": "e1", "phone_hash": "same_phone"},
            {"entry_id": "e2", "phone_hash": "same_phone"},
        ]
        clusters, sizes = build_clusters(entries, enabled=False)
        self.assertNotEqual(clusters["e1"], clusters["e2"])
        self.assertEqual(sizes[clusters["e1"]], 1)
        self.assertEqual(sizes[clusters["e2"]], 1)


if __name__ == "__main__":
    unittest.main()
