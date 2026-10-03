"""Tests for Proof-of-Work (PoW) challenge creation, solving, and verification."""

import unittest
import time
from fairdrop_core.pow import (
    make_challenge_payload,
    serialize_challenge,
    deserialize_challenge,
    verify_challenge,
    solve_challenge,
    count_leading_zero_bits,
)


class TestPoW(unittest.TestCase):

    def setUp(self):
        self.secret = "test-pow-hmac-secret-key-32bytes!"
        self.sid = "session-test-sid-12345"
        self.identity_id = "identity-user-uuid-67890"

    def test_leading_zero_bits_counter(self):
        self.assertEqual(count_leading_zero_bits(b"\x00\x00\x00"), 24)
        self.assertEqual(count_leading_zero_bits(b"\x00\x00\x80"), 16)
        self.assertEqual(count_leading_zero_bits(b"\x00\x00\x01"), 23)
        self.assertEqual(count_leading_zero_bits(b"\x7f"), 1)
        self.assertEqual(count_leading_zero_bits(b"\x80"), 0)

    def test_challenge_serialization_roundtrip(self):
        payload = make_challenge_payload(
            sid=self.sid,
            identity_id=self.identity_id,
            secret=self.secret,
            difficulty_bits=12
        )
        serialized = serialize_challenge(payload)
        deserialized = deserialize_challenge(serialized)
        self.assertIsNotNone(deserialized)
        self.assertEqual(payload["nonce"], deserialized["nonce"])
        self.assertEqual(payload["sig"], deserialized["sig"])
        self.assertEqual(payload["difficulty_bits"], deserialized["difficulty_bits"])

    def test_solve_and_verify_valid(self):
        # 12 bits difficulty is fast for unit test (~2^12 = 4096 hashes)
        payload = make_challenge_payload(
            sid=self.sid,
            identity_id=self.identity_id,
            secret=self.secret,
            difficulty_bits=12
        )
        serialized = serialize_challenge(payload)

        # Solve
        solution = solve_challenge(serialized)
        self.assertIsNotNone(solution)

        # Verify
        is_valid, reason = verify_challenge(
            challenge_input=serialized,
            solution=solution,
            expected_identity_id=self.identity_id,
            secret=self.secret
        )
        self.assertTrue(is_valid)
        self.assertEqual(reason, "OK")

    def test_expired_challenge(self):
        # Issued in the past
        past_time = int(time.time()) - 400
        payload = make_challenge_payload(
            sid=self.sid,
            identity_id=self.identity_id,
            secret=self.secret,
            difficulty_bits=8,
            ttl_seconds=300,
            issued_at=past_time
        )
        solution = solve_challenge(payload)
        is_valid, reason = verify_challenge(
            challenge_input=payload,
            solution=solution,
            expected_identity_id=self.identity_id,
            secret=self.secret
        )
        self.assertFalse(is_valid)
        self.assertEqual(reason, "CHALLENGE_EXPIRED")

    def test_identity_mismatch(self):
        payload = make_challenge_payload(
            sid=self.sid,
            identity_id=self.identity_id,
            secret=self.secret,
            difficulty_bits=8
        )
        solution = solve_challenge(payload)
        is_valid, reason = verify_challenge(
            challenge_input=payload,
            solution=solution,
            expected_identity_id="different-user-identity",
            secret=self.secret
        )
        self.assertFalse(is_valid)
        self.assertEqual(reason, "IDENTITY_MISMATCH")

    def test_tampered_signature(self):
        payload = make_challenge_payload(
            sid=self.sid,
            identity_id=self.identity_id,
            secret=self.secret,
            difficulty_bits=8
        )
        solution = solve_challenge(payload)
        # Tamper difficulty
        payload["difficulty_bits"] = 4
        is_valid, reason = verify_challenge(
            challenge_input=payload,
            solution=solution,
            expected_identity_id=self.identity_id,
            secret=self.secret
        )
        self.assertFalse(is_valid)
        self.assertEqual(reason, "INVALID_SIGNATURE")

    def test_ablation_disabled(self):
        # When PoW is disabled in config, verification always passes
        is_valid, reason = verify_challenge(
            challenge_input={},
            solution="fake",
            expected_identity_id=self.identity_id,
            secret=self.secret,
            enabled=False
        )
        self.assertTrue(is_valid)
        self.assertEqual(reason, "POW_DISABLED")


if __name__ == "__main__":
    unittest.main()
