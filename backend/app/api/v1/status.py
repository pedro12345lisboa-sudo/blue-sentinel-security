import time

import psutil
from fastapi import APIRouter, Depends, Request

from app.cache.redis import get_redis
from app.core.deps import get_db_session
from app.monitoring import metrics
from app.monitoring.health_check import check_disk
from app.monitoring.resource_monitor import current_level, sample_once
from app.schemas.status import StatusResponse

router = APIRouter(prefix="/status", tags=["status"])

_start_time = time.monotonic()


@router.get("", response_model=StatusResponse)
async def system_status(request: Request, db=Depends(get_db_session)):
    """Métricas públicas e seguras — sem detalhes internos."""
    started = time.perf_counter()
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

    # Amostra síncrona barata (cpu_percent(interval=0) não bloqueia) para que os
    # gauges nunca fiquem congelados quando o monitor em background parar.
    sample_once()
    disk = check_disk()

    return StatusResponse(
        uptime_seconds=time.monotonic() - _start_time,
        cpu_percent=psutil.cpu_percent(interval=0.0),
        memory_percent=psutil.virtual_memory().percent,
        disk_percent=disk.value,
        api_latency_ms=round(api_latency, 2),
        database_reachable=db_ok,
        cache_reachable=cache_ok,
        latency_percentiles=metrics.latency_percentiles(),
        degradation_level=int(current_level()),
    )
