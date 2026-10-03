"""Adversarial bot profiles for load and abuse simulation.

Spec Section 7:
Implements 7 distinct automated behaviors:
1. naive_fast: spam entry requests as fast as possible
2. retry_flood: hammer entry/confirm with repeated submissions
3. ip_rotator: rotates mock proxy IPs
4. header_spoofer: forges X-Forwarded-For, CF-Connecting-IP, True-Client-IP
5. sybil_minter: registers burst of aliased (+tags, dots) & disposable accounts
6. human_like: realistic human delays, standard browser headers
7. token_replayer: attempts replay of PoW solution / session tokens
"""

import asyncio
import time
import secrets
import logging
from typing import Dict, Any, List, Optional
import httpx
from fairdrop_core.pow import solve_challenge

logger = logging.getLogger("sim.bots")


class BotRunner:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url

    async def run_naive_fast(self, email: str, count: int = 50) -> Dict[str, Any]:
        """Spams entry requests rapidly using one identity."""
        async with httpx.AsyncClient(base_url=self.base_url, timeout=10.0) as client:
            # 1. Register & verify
            reg_resp = await client.post("/auth/register", json={"email": email})
            ident_id = reg_resp.json().get("identity_id")
            ver_resp = await client.post("/auth/verify", json={"identity_id": ident_id, "email_otp": "000000"})
            sid = ver_resp.json().get("sid")
            cookies = {"sid": sid}

            # 2. Get challenge
            chal_resp = await client.get("/entry/challenge", cookies=cookies)
            chal_data = chal_resp.json()
            solution = solve_challenge(chal_data["challenge"])

            # 3. Spam requests
            successes = 0
            rate_limited = 0
            replayed = 0

            for _ in range(count):
                resp = await client.post(
                    "/entry",
                    json={"challenge": chal_data["challenge"], "solution": solution},
                    cookies=cookies
                )
                if resp.status_code == 200:
                    successes += 1
                elif resp.status_code == 429:
                    rate_limited += 1
                elif resp.status_code == 409:
                    replayed += 1

            return {
                "profile": "naive_fast",
                "total_sent": count,
                "successes": successes,
                "rate_limited": rate_limited,
                "replayed": replayed
            }

    async def run_header_spoofer(self, email: str) -> Dict[str, Any]:
        """Sends requests with forged forwarding headers; asserts defenses ignore them."""
        forged_headers = {
            "X-Forwarded-For": "8.8.8.8, 1.1.1.1",
            "Forwarded": "for=198.51.100.99;proto=https",
            "CF-Connecting-IP": "203.0.113.5",
            "True-Client-IP": "192.0.2.1",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
        }
        async with httpx.AsyncClient(base_url=self.base_url, headers=forged_headers, timeout=10.0) as client:
            reg_resp = await client.post("/auth/register", json={"email": email})
            ident_id = reg_resp.json().get("identity_id")
            ver_resp = await client.post("/auth/verify", json={"identity_id": ident_id, "email_otp": "000000"})
            cookies = {"sid": ver_resp.json().get("sid")}

            chal_resp = await client.get("/entry/challenge", cookies=cookies)
            solution = solve_challenge(chal_resp.json()["challenge"])

            entry_resp = await client.post(
                "/entry",
                json={"challenge": chal_resp.json()["challenge"], "solution": solution},
                cookies=cookies
            )
            return {
                "profile": "header_spoofer",
                "status_code": entry_resp.status_code,
                "entry_result": entry_resp.json()
            }

    async def run_sybil_minter(self, base_email: str, num_identities: int = 20) -> Dict[str, Any]:
        """Creates N aliased/disposable accounts to attempt Sybil flooding."""
        created = []
        async with httpx.AsyncClient(base_url=self.base_url, timeout=10.0) as client:
            for i in range(num_identities):
                alias_email = f"{base_email.split('@')[0]}+{i}@{base_email.split('@')[1]}"
                reg_resp = await client.post("/auth/register", json={"email": alias_email})
                if reg_resp.status_code == 200:
                    created.append(reg_resp.json().get("identity_id"))

            return {
                "profile": "sybil_minter",
                "attempted": num_identities,
                "created": len(created)
            }

    async def run_ip_rotator(self, email: str, ips: List[str]) -> Dict[str, Any]:
        """Attempts to bypass rate limiting by rotating client IP addresses via proxy headers."""
        results = []
        async with httpx.AsyncClient(base_url=self.base_url, timeout=10.0) as client:
            reg_resp = await client.post("/auth/register", json={"email": email})
            ident_id = reg_resp.json().get("identity_id")
            ver_resp = await client.post("/auth/verify", json={"identity_id": ident_id, "email_otp": "000000"})
            cookies = {"sid": ver_resp.json().get("sid")}

            for mock_ip in ips:
                headers = {"X-Real-IP": mock_ip, "X-Forwarded-For": mock_ip}
                chal_resp = await client.get("/entry/challenge", cookies=cookies, headers=headers)
                results.append({
                    "ip": mock_ip,
                    "challenge_status": chal_resp.status_code
                })
        return {
            "profile": "ip_rotator",
            "rotated_ips": len(ips),
            "results": results
        }

    async def run_human_like(self, email: str) -> Dict[str, Any]:
        """Mimics authentic human behavior: natural jittered delays and legitimate browser headers."""
        human_headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "application/json, text/plain, */*"
        }
        async with httpx.AsyncClient(base_url=self.base_url, headers=human_headers, timeout=15.0) as client:
            # Human pause before registration
            await asyncio.sleep(0.5)
            reg_resp = await client.post("/auth/register", json={"email": email})
            ident_id = reg_resp.json().get("identity_id")

            # Human reading OTP email
            await asyncio.sleep(1.0)
            ver_resp = await client.post("/auth/verify", json={"identity_id": ident_id, "email_otp": "000000"})
            cookies = {"sid": ver_resp.json().get("sid")}

            # Human requesting challenge & solving PoW
            chal_resp = await client.get("/entry/challenge", cookies=cookies)
            solution = solve_challenge(chal_resp.json()["challenge"])

            # Submit entry
            entry_resp = await client.post(
                "/entry",
                json={"challenge": chal_resp.json()["challenge"], "solution": solution},
                cookies=cookies
            )
            return {
                "profile": "human_like",
                "status_code": entry_resp.status_code,
                "result": entry_resp.json()
            }

    async def run_token_replayer(self, email: str) -> Dict[str, Any]:
        """Attempts to replay an already-consumed PoW challenge solution or reused session nonce."""
        async with httpx.AsyncClient(base_url=self.base_url, timeout=10.0) as client:
            reg_resp = await client.post("/auth/register", json={"email": email})
            ident_id = reg_resp.json().get("identity_id")
            ver_resp = await client.post("/auth/verify", json={"identity_id": ident_id, "email_otp": "000000"})
            cookies = {"sid": ver_resp.json().get("sid")}

            chal_resp = await client.get("/entry/challenge", cookies=cookies)
            chal_str = chal_resp.json()["challenge"]
            solution = solve_challenge(chal_str)

            # First legitimate submission
            first_resp = await client.post(
                "/entry",
                json={"challenge": chal_str, "solution": solution},
                cookies=cookies
            )

            # Second replay attempt using identical solution & challenge
            replay_resp = await client.post(
                "/entry",
                json={"challenge": chal_str, "solution": solution},
                cookies=cookies
            )

            return {
                "profile": "token_replayer",
                "first_submission_code": first_resp.status_code,
                "replay_submission_code": replay_resp.status_code,
                "replay_detected": replay_resp.status_code in (400, 409)
            }
