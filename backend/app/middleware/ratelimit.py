"""Atomic multi-dimensional rate limiting middleware.

Architecture Section 4.1 & Spec Section 4.5:
Enforces token buckets atomically across:
- identity
- session
- IP /24 (IPv4) or /64 (IPv6)
- device fingerprint
- global admission control
Returns 429 + Retry-After if exceeded.
"""

import time
import os
import hashlib
from pathlib import Path
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.requests import Request
from app.middleware.client_ip import get_client_ip, get_ip_prefix
from app.services.redis_keys import key_ratelimit

LUA_DIR = Path(__file__).resolve().parent.parent / "redis_scripts"
with open(LUA_DIR / "ratelimit.lua", "r") as f:
    RATELIMIT_LUA = f.read()


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.ratelimit_script = None

    async def dispatch(self, request: Request, call_next):
        # Exclude static assets or health checks
        path = request.url.path
        if path.startswith("/static") or path == "/healthz":
            return await call_next(request)

        # Check defense toggle
        def_rl = os.getenv("DEF_RATE_LIMITS", "true").lower() == "true"
        if not def_rl:
            return await call_next(request)

        r = getattr(request.app.state, "redis", None)
        if not r:
            return await call_next(request)

        if self.ratelimit_script is None:
            self.ratelimit_script = r.register_script(RATELIMIT_LUA)

        now_sec = int(time.time())
        client_ip = get_client_ip(request)
        ip_prefix = get_ip_prefix(client_ip)

        # Session / Identity if available
        sid = request.cookies.get("sid", "anon")
        ua_raw = request.headers.get("user-agent", "unknown")
        dev_hash = hashlib.sha256(ua_raw.encode("utf-8")).hexdigest()[:16]

        # Define buckets: (key, capacity, refill_rate_per_sec)
        buckets = [
            (key_ratelimit("ip", ip_prefix), 60, 10),      # 60 burst, 10 req/s per subnet
            (key_ratelimit("sess", sid), 40, 5),          # 40 burst, 5 req/s per session
            (key_ratelimit("dev", dev_hash), 50, 8),       # 50 burst, 8 req/s per device
            (key_ratelimit("global", "all"), 5000, 1000)   # 5000 burst, 1000 req/s global
        ]

        keys = [b[0] for b in buckets]
        args = [now_sec, 1]
        for b in buckets:
            args.extend([b[1], b[2]])

        try:
            res = await self.ratelimit_script(keys=keys, args=args)
            allowed, limited_key, retry_after = int(res[0]), res[1].decode("utf-8"), int(res[2])
            if allowed == 0:
                return JSONResponse(
                    status_code=429,
                    content={
                        "code": "RATE_LIMITED",
                        "message": "Too many requests. Please slow down.",
                        "retry_after": retry_after
                    },
                    headers={"Retry-After": str(retry_after)}
                )
        except Exception:
            # Fail open if Redis rate limit check encounters error
            pass

        return await call_next(request)
