"""Coleta de CPU/RAM/disco e política de degradação controlada.

Níveis (documentados em docs/architecture/performance.md):

======  =========================================================================
Nível   Efeito
======  =========================================================================
0       ``NORMAL`` — tudo ligado.
1       ``LAB_DISABLED`` — disco > 80 %, CPU > 90 % ou RAM > 90 %: o
        laboratório (WebSocket + sessões) é desligado, o site continua.
2       ``CRITICAL`` — disco > 90 %: além do laboratório, os recursos
        opcionais (stats GitHub) também ficam indisponíveis; health/contact
        continuam respondendo.
======  =========================================================================

A amostragem roda em segundo plano (task asyncio) e alimenta os gauges
Prometheus; :func:`sample_once` é síncrono e determinístico para testes.
"""

from __future__ import annotations

import asyncio
import logging
import platform
import time
from dataclasses import dataclass, field
from enum import IntEnum

import psutil

from app.core.config import settings
from app.monitoring import metrics

logger = logging.getLogger(__name__)


class DegradationLevel(IntEnum):
    NORMAL = 0
    LAB_DISABLED = 1
    CRITICAL = 2


@dataclass
class ResourceSample:
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    rss_bytes: int
    level: DegradationLevel
    timestamp: float = field(default_factory=time.time)


_level: DegradationLevel = DegradationLevel.NORMAL
_last_sample: ResourceSample | None = None
_disk_alerted: bool = False


def compute_level(
    cpu_percent: float,
    memory_percent: float,
    disk_percent: float,
) -> DegradationLevel:
    if disk_percent >= settings.disk_critical_threshold:
        return DegradationLevel.CRITICAL
    if (
        disk_percent >= settings.disk_alert_threshold
        or cpu_percent >= settings.cpu_degrade_threshold
        or memory_percent >= settings.memory_degrade_threshold
    ):
        return DegradationLevel.LAB_DISABLED
    return DegradationLevel.NORMAL


def sample_once() -> ResourceSample:
    """Uma amostra síncrona de recursos + avaliação do nível de degradação."""
    global _level, _last_sample, _disk_alerted

    cpu = float(psutil.cpu_percent(interval=0.0))
    memory = float(psutil.virtual_memory().percent)
    try:
        disk = float(psutil.disk_usage(_disk_path()).percent)
    except OSError:
        disk = 0.0
    try:
        rss = int(psutil.Process().memory_info().rss)
    except Exception:  # pragma: no cover - defensivo
        rss = 0

    level = compute_level(cpu, memory, disk)

    metrics.CPU_PERCENT.set(cpu)
    metrics.MEMORY_PERCENT.set(memory)
    metrics.DISK_PERCENT.set(disk)
    metrics.PROCESS_RSS_BYTES.set(rss)
    metrics.DISK_ALERT.set(1.0 if disk >= settings.disk_alert_threshold else 0.0)
    metrics.DEGRADATION_LEVEL.set(float(level))

    if disk >= settings.disk_alert_threshold and not _disk_alerted:
        _disk_alerted = True
        logger.warning(
            "ALERTA de disco: %.1f%% >= %.1f%%", disk, settings.disk_alert_threshold
        )
    elif disk < settings.disk_alert_threshold and _disk_alerted:
        _disk_alerted = False
        logger.info("Disco normalizado: %.1f%%", disk)

    if level != _level:
        logger.warning(
            "Nível de degradação mudou %s -> %s (cpu=%.1f mem=%.1f disk=%.1f)",
            _level.name,
            level.name,
            cpu,
            memory,
            disk,
        )
    _level = level
    _last_sample = ResourceSample(
        cpu_percent=cpu,
        memory_percent=memory,
        disk_percent=disk,
        rss_bytes=rss,
        level=level,
    )
    return _last_sample


def _disk_path() -> str:
    return "\\" if platform.system() == "Windows" else "/"


def current_level() -> DegradationLevel:
    return _level


def last_sample() -> ResourceSample | None:
    return _last_sample


def lab_disabled() -> bool:
    """True quando o laboratório deve ficar fora do ar (degradação controlada)."""
    if not settings.lab_degrade_enabled:
        return False
    return _level >= DegradationLevel.LAB_DISABLED


def optional_resources_disabled() -> bool:
    return _level >= DegradationLevel.CRITICAL


async def _run(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await asyncio.to_thread(sample_once)
            queue_len = await _queue_depth()
            if queue_len is not None:
                metrics.QUEUE_DEPTH.labels(queue="email").set(queue_len)
        except Exception:
            logger.warning("Falha na amostragem de recursos", exc_info=True)
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.resource_sample_interval)
        except asyncio.TimeoutError:
            continue


async def _queue_depth() -> int | None:
    try:
        from app.cache.redis import get_redis

        return int(await get_redis().llen(settings.email_queue_key))
    except Exception:
        return None


_task: asyncio.Task | None = None
_stop: asyncio.Event | None = None


def start() -> None:
    """Inicia a coleta em background (chamado no lifespan do app)."""
    global _task, _stop
    if _task is None or _task.done():
        sample_once()
        _stop = asyncio.Event()
        _task = asyncio.create_task(_run(_stop))


async def stop() -> None:
    """Para a coleta de forma graciosa (aguarda a rodada em curso)."""
    global _task, _stop
    if _stop is not None:
        _stop.set()
    if _task is not None:
        try:
            await _task
        except asyncio.CancelledError:
            pass
        except Exception:  # pragma: no cover - defensivo
            logger.warning("Monitor de recursos terminou com erro", exc_info=True)
    _task = None
    _stop = None
