"""Verificações de saúde: Postgres, Redis e disco.

Usadas por ``/health/ready``, ``/metrics`` e pelo relatório de ``/status``.
Cada check é independente: a falha de um não impede os demais e nunca lança —
o sistema responde ``degraded`` em vez de erro 500.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from app.core.config import settings
from app.monitoring import metrics

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CheckResult:
    name: str
    ok: bool
    latency_ms: float = 0.0
    detail: str = ""
    value: float = 0.0

    @property
    def status(self) -> str:
        return "ok" if self.ok else "fail"


async def check_database(db=None) -> CheckResult:
    """``SELECT 1`` com medição de latência."""
    started = time.perf_counter()
    try:
        if db is None:
            from app.database.session import async_session_maker

            from sqlalchemy import text

            async with async_session_maker() as session:
                await session.execute(text("SELECT 1"))
        else:
            from sqlalchemy import text

            await db.execute(text("SELECT 1"))
        ok = True
        detail = ""
    except Exception as exc:
        ok = False
        detail = type(exc).__name__
        logger.warning("Health check: banco indisponível (%s)", detail)
    latency = (time.perf_counter() - started) * 1000
    metrics.POSTGRES_UP.set(1.0 if ok else 0.0)
    return CheckResult("database", ok, round(latency, 2), detail)


async def check_redis() -> CheckResult:
    """Ping no Redis com medição de latência."""
    started = time.perf_counter()
    try:
        from app.cache.redis import get_redis

        await get_redis().ping()
        ok = True
        detail = ""
    except Exception as exc:
        ok = False
        detail = type(exc).__name__
        logger.warning("Health check: Redis indisponível (%s)", detail)
    latency = (time.perf_counter() - started) * 1000
    metrics.REDIS_UP.set(1.0 if ok else 0.0)
    return CheckResult("cache", ok, round(latency, 2), detail)


def check_disk() -> CheckResult:
    """Disco: falha só no limite crítico (> 90 %); alerta aos 80 %."""
    import psutil

    from app.monitoring.resource_monitor import _disk_path

    started = time.perf_counter()
    try:
        percent = float(psutil.disk_usage(_disk_path()).percent)
        ok = percent < settings.disk_critical_threshold
        detail = f"{percent:.1f}%"
    except OSError as exc:
        percent = 0.0
        ok = True
        detail = type(exc).__name__
    latency = (time.perf_counter() - started) * 1000
    metrics.DISK_PERCENT.set(percent)
    metrics.DISK_ALERT.set(1.0 if percent >= settings.disk_alert_threshold else 0.0)
    return CheckResult("disk", ok, round(latency, 2), detail, value=round(percent, 2))


async def readiness(db=None) -> tuple[str, dict[str, str], dict[str, float]]:
    """Agrega todos os checks: ``status``, ``checks`` e ``latency_ms``."""
    db_result = await check_database(db)
    redis_result = await check_redis()
    disk_result = check_disk()

    results = [db_result, redis_result, disk_result]
    status = "ok" if all(r.ok for r in results) else "degraded"
    return (
        status,
        {r.name: r.status for r in results},
        {r.name: r.latency_ms for r in results},
    )
