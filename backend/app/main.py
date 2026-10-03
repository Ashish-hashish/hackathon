"""Fair Drop API application factory.

Architecture Section 1 & 4:
FastAPI application with:
- Strict reverse-proxy client IP handling
- Redis Lua script pre-compilation
- Postgres connection pool management
- Multi-dimensional token-bucket rate limiting
- Realtime latency histogram metrics middleware
"""

import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as redis
from app.db.connection import get_db_pool, close_db_pool
from app.api import auth, entry, me, hold, audit, admin, events
from app.middleware.ratelimit import RateLimitMiddleware
from app.middleware.metrics import MetricsMiddleware

LUA_DIR = Path(__file__).resolve().parent / "redis_scripts"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Redis and Postgres pool
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    r = redis.from_url(redis_url)
    app.state.redis = r

    # Pre-register Lua scripts on startup
    with open(LUA_DIR / "entry.lua", "r") as f:
        app.state.entry_script = r.register_script(f.read())
    with open(LUA_DIR / "admit.lua", "r") as f:
        app.state.admit_script = r.register_script(f.read())
    with open(LUA_DIR / "confirm.lua", "r") as f:
        app.state.confirm_script = r.register_script(f.read())
    with open(LUA_DIR / "expire.lua", "r") as f:
        app.state.expire_script = r.register_script(f.read())

    # Initialize Postgres pool
    app.state.db_pool = await get_db_pool()

    yield

    # Shutdown: Close connections
    await r.aclose()
    await close_db_pool()


app = FastAPI(
    title="Fair Drop API",
    version="1.0.0",
    description="High-concurrency anti-Sybil fair allocation platform",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom middlewares
app.add_middleware(MetricsMiddleware)
app.add_middleware(RateLimitMiddleware)

# Routers
app.include_router(auth.router)
app.include_router(entry.router)
app.include_router(me.router)
app.include_router(hold.router)
app.include_router(audit.router)
app.include_router(admin.router)
app.include_router(events.router)


@app.get("/healthz")
async def healthz():
    return {"status": "HEALTHY", "service": "fairdrop-api"}
