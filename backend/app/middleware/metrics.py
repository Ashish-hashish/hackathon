"""Per-second metrics collection middleware.

Architecture Section 12.3:
Records request count, status code classes, and latency histogram buckets into
per-second Redis hashes metrics:{evt}:{sec}. Enables zero-overhead realtime Ops monitoring.
"""

import time
import os
import asyncio
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from app.services.redis_keys import key_metrics


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        r = getattr(request.app.state, "redis", None)
        if r:
            event_id = os.getenv("EVENT_ID", "event_drop_001")
            sec_epoch = int(time.time())
            m_key = key_metrics(event_id, sec_epoch)

            # Classify status
            status_code = response.status_code
            if 200 <= status_code < 300:
                sc_class = "2xx"
            elif status_code == 429:
                sc_class = "429"
            elif 400 <= status_code < 500:
                sc_class = "4xx"
            else:
                sc_class = "5xx"

            # Classify latency bucket
            if duration_ms < 10:
                lat_bucket = "lat_10"
            elif duration_ms < 25:
                lat_bucket = "lat_25"
            elif duration_ms < 50:
                lat_bucket = "lat_50"
            elif duration_ms < 100:
                lat_bucket = "lat_100"
            elif duration_ms < 250:
                lat_bucket = "lat_250"
            elif duration_ms < 500:
                lat_bucket = "lat_500"
            else:
                lat_bucket = "lat_1000plus"

            # Pipeline metrics increment in background
            try:
                pipeline = r.pipeline(transaction=False)
                pipeline.hincrby(m_key, "total_reqs", 1)
                pipeline.hincrby(m_key, sc_class, 1)
                pipeline.hincrby(m_key, lat_bucket, 1)
                pipeline.expire(m_key, 3600) # Retain 1 hour of per-second metrics
                asyncio.create_task(pipeline.execute())
            except Exception:
                pass

        return response
