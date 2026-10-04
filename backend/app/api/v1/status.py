import logging
import time

import psutil
from fastapi import APIRouter, Depends, Request

from app.cache.redis import get_redis
from app.core.deps import get_db_session
from app.schemas.status import StatusResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/status", tags=["status"])

_start_time = time.monotonic()


@router.get("", response_model=StatusResponse)
async def system_status(request: Request, db=Depends(get_db_session)):
    """Métricas públicas e seguras — sem detalhes internos."""
    loop = request.app.router.loop if hasattr(request.app.router, "loop") else None

    started = time.perf_counter()
    # API latency = time to execute this handler's DB round-trip
    try:
        from sqlalchemy import text
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    api_latency = (time.perf_counter() - started) * 1000

    try:
        await get_redis().ping()
        cache_ok = True
    except Exception:
        cache_ok = False

    return StatusResponse(
        uptime_seconds=time.monotonic() - _start_time,
        cpu_percent=psutil.cpu_percent(interval=0.0),
        memory_percent=psutil.virtual_memory().percent,
        disk_percent=psutil.disk_usage("/").percent if hasattr(psutil.disk_usage("/"), "percent") else 0.0,
        api_latency_ms=round(api_latency, 2),
        database_reachable=db_ok,
        cache_reachable=cache_ok,
    )
