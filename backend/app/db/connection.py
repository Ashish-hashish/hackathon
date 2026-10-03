"""PostgreSQL connection management using asyncpg pool."""

import os
from typing import Optional, AsyncGenerator
import asyncpg

_pool: Optional[asyncpg.Pool] = None


async def get_db_pool() -> Optional[asyncpg.Pool]:
    """Returns or creates the shared asyncpg connection pool."""
    global _pool
    if _pool is None:
        db_url = os.getenv("DATABASE_URL", "postgresql://fairdrop:fairdrop_password@localhost:5432/fairdrop_db")
        try:
            _pool = await asyncpg.create_pool(
                dsn=db_url,
                min_size=2,
                max_size=20,
                command_timeout=10
            )
        except Exception:
            _pool = None
    return _pool


async def close_db_pool() -> None:
    """Closes the shared connection pool gracefully."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
