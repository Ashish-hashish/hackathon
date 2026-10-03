"""Tests for client_ip middleware and proxy header spoofing defenses."""

import unittest
from unittest.mock import MagicMock
from app.middleware.client_ip import get_client_ip, get_ip_prefix, is_peer_trusted


class DummyClient:
    def __init__(self, host: str):
        self.host = host


class DummyRequest:
    def __init__(self, client_host: str, headers: dict):
        self.client = DummyClient(client_host)
        self.headers = {k.lower(): v for k, v in headers.items()}


class TestClientIp(unittest.TestCase):

    def test_forged_headers_completely_ignored(self):
        """Attacker sends forged XFF, CF, Forwarded headers from external IP."""
        req = DummyRequest(
            client_host="203.0.113.195",
            headers={
                "x-forwarded-for": "1.1.1.1, 8.8.8.8",
                "forwarded": "for=192.0.2.60;proto=http;by=203.0.113.43",
                "cf-connecting-ip": "1.2.3.4",
                "true-client-ip": "5.6.7.8",
                "x-real-ip": "9.9.9.9"  # Untrusted peer cannot set X-Real-IP!
            }
        )
        resolved_ip = get_client_ip(req)
        # MUST return the actual TCP peer address, NOT any forged header!
        self.assertEqual(resolved_ip, "203.0.113.195")

    def test_trusted_proxy_x_real_ip_honored(self):
        """Connection from internal trusted proxy (e.g. 172.18.0.2 or 127.0.0.1)."""
        req = DummyRequest(
            client_host="127.0.0.1",
            headers={
                "x-real-ip": "198.51.100.42",
                "x-forwarded-for": "ignored"
            }
        )
        resolved_ip = get_client_ip(req)
        self.assertEqual(resolved_ip, "198.51.100.42")

    def test_ip_prefix_normalization(self):
        # IPv4 to /24
        self.assertEqual(get_ip_prefix("192.168.1.55"), "192.168.1.0/24")
        self.assertEqual(get_ip_prefix("10.20.30.40"), "10.20.30.0/24")
        
        # IPv6 to /64
        self.assertEqual(
            get_ip_prefix("2001:0db8:85a3:0000:0000:8a2e:0370:7334"),
            "2001:db8:85a3::/64"
        )


if __name__ == "__main__":
    unittest.main()
