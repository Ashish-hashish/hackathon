"""Tests for email and phone canonicalization, hashing, and disposable domain detection."""

import unittest
from fairdrop_core.canonical import (
    canonicalize_email,
    normalize_phone_e164,
    hash_phone,
    is_disposable_domain,
)


class TestCanonical(unittest.TestCase):

    def test_gmail_canonicalization(self):
        # Dots stripped
        self.assertEqual(canonicalize_email("j.o.h.n.d.o.e@gmail.com"), "johndoe@gmail.com")
        # +tag stripped
        self.assertEqual(canonicalize_email("johndoe+drop123@gmail.com"), "johndoe@gmail.com")
        # Dots and +tag combined
        self.assertEqual(canonicalize_email("j.o.h.n+drop@gmail.com"), "john@gmail.com")
        # googlemail.com unified to gmail.com
        self.assertEqual(canonicalize_email("user.name+ticket@googlemail.com"), "username@gmail.com")
        # Uppercase normalized
        self.assertEqual(canonicalize_email("  User.Name@GMAIL.COM  "), "username@gmail.com")

    def test_other_providers_canonicalization(self):
        # Outlook / Hotmail: keeps dots, strips +tag
        self.assertEqual(canonicalize_email("john.doe+fairdrop@outlook.com"), "john.doe@outlook.com")
        self.assertEqual(canonicalize_email("jane+contest@yahoo.com"), "jane@yahoo.com")
        # Custom domain: strips +tag
        self.assertEqual(canonicalize_email("team+bot1@company.org"), "team@company.org")

    def test_canonical_ablation_disabled(self):
        # When defense is disabled (ablation mode), aliases are not collapsed
        self.assertEqual(
            canonicalize_email("j.o.h.n+alias@gmail.com", enabled=False),
            "j.o.h.n+alias@gmail.com"
        )

    def test_disposable_email_detection(self):
        self.assertTrue(is_disposable_domain("bot@mailinator.com"))
        self.assertTrue(is_disposable_domain("sybil@10minutemail.com"))
        self.assertTrue(is_disposable_domain("attacker@sharklasers.com"))
        self.assertTrue(is_disposable_domain("user@tempmail.com"))
        self.assertTrue(is_disposable_domain("temp-mail.org"))
        # Legitimate domains are not flagged
        self.assertFalse(is_disposable_domain("legit@gmail.com"))
        self.assertFalse(is_disposable_domain("user@outlook.com"))
        self.assertFalse(is_disposable_domain("engineer@university.edu"))

    def test_phone_normalization_and_hashing(self):
        pepper = "test-secret-pepper-32-chars-long!"
        
        # Variations of the same number
        p1 = "+1 (555) 019-2834"
        p2 = "+15550192834"
        p3 = " +1 555-019-2834 "
        
        self.assertEqual(normalize_phone_e164(p1), "+15550192834")
        self.assertEqual(normalize_phone_e164(p2), "+15550192834")
        self.assertEqual(normalize_phone_e164(p3), "+15550192834")

        # Hashing produces identical hex digest
        h1 = hash_phone(p1, pepper)
        h2 = hash_phone(p2, pepper)
        h3 = hash_phone(p3, pepper)
        self.assertEqual(h1, h2)
        self.assertEqual(h2, h3)
        self.assertEqual(len(h1), 64)  # SHA-256 hex string

        # Different phone produces different hash
        h_diff = hash_phone("+15550199999", pepper)
        self.assertNotEqual(h1, h_diff)


if __name__ == "__main__":
    unittest.main()
