"""Filas de jobs em segundo plano (Redis) com backpressure e dead-letter.

Formato de uma mensagem:

.. code-block:: json

    {"id": "…", "kind": "email.contact", "payload": {…},
     "attempts": 1, "max_attempts": 5, "enqueued_at": 1718000000.0}

Fluxo de retentativa::

    queue ──LPOP──▶ worker ──falhou──▶ queue:delayed (ZSET, score=ready_at)
                        │                      │
                        └──esgotou tentativas──┴──▶ queue:dead (DLQ)

``move_due_jobs`` reposiciona os itens vencidos do ZSET para a fila principal
(no worker ou no scheduler). Toda operação tolera Redis indisponível: a fila
degrada para "sem job" e o site continua de pé.
"""

from __future__ import annotations

import json
import logging
import random
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from typing import Any

from app.cache.redis import get_redis
from app.core.config import settings
from app.monitoring import metrics

logger = logging.getLogger(__name__)

EMAIL_KIND = "email.contact"

Handler = Callable[["Job"], Awaitable[None]]


class JobFailure(Exception):
    """Falha transitória no processamento de um job (deve ser retentada)."""


@dataclass
class Job:
    kind: str
    payload: dict[str, Any] = field(default_factory=dict)
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    attempts: int = 1
    max_attempts: int = 0
    enqueued_at: float = field(default_factory=time.time)
    last_error: str = ""

    def __post_init__(self) -> None:
        if not self.max_attempts:
            self.max_attempts = settings.email_max_attempts

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)

    @classmethod
    def from_json(cls, raw: str) -> Job:
        data = json.loads(raw)
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


def queue_key(kind: str) -> str:
    if kind == EMAIL_KIND:
        return settings.email_queue_key
    return f"queue:{kind}"


def delayed_key(key: str) -> str:
    return f"{key}:delayed"


def dead_letter_key(kind: str) -> str:
    if kind == EMAIL_KIND:
        return settings.email_dead_letter_key
    return f"queue:{kind}:dead"


# ------------------------------------------------------------------ producer
async def enqueue_job(job: Job) -> bool:
    """Enfileira com backpressure: acima do limite devolve ``False`` (não enfileira).

    O chamador (endpoint de contato) já persistiu a mensagem no banco — a fila
    cheia só desliga o e-mail, nunca a recepção do formulário.
    """
    key = queue_key(job.kind)
    try:
        redis = get_redis()
        depth = int(await redis.llen(key))
        if depth >= settings.email_queue_max_len:
            metrics.QUEUE_DEPTH.labels(queue=job.kind).set(depth)
            logger.warning(
                "Backpressure: fila %s cheia (%d >= %d) — job descartado",
                key,
                depth,
                settings.email_queue_max_len,
            )
            return False
        await redis.rpush(key, job.to_json())
        metrics.QUEUE_DEPTH.labels(queue=job.kind).set(depth + 1)
        return True
    except Exception:
        # Redis fora do ar: e-mail não é crítico, o site não pode parar.
        logger.warning("Enqueue falhou (Redis indisponível?) kind=%s", job.kind, exc_info=True)
        return False


async def enqueue_email(payload: dict[str, Any]) -> bool:
    return await enqueue_job(Job(kind=EMAIL_KIND, payload=payload))


# ------------------------------------------------------------------ consumer
async def dequeue_job(kind: str) -> Job | None:
    try:
        raw = await get_redis().lpop(queue_key(kind))
    except Exception:
        logger.warning("Dequeue falhou kind=%s", kind, exc_info=True)
        return None
    if not raw:
        return None
    try:
        return Job.from_json(raw)
    except (ValueError, TypeError):
        logger.warning("Mensagem inválida descartada da fila %s", kind)
        return None


async def schedule_retry(job: Job, delay_seconds: float) -> None:
    """Agenda reprocessamento em ``queue:delayed`` (ZSET com score=ready_at)."""
    ready_at = time.time() + max(0.0, delay_seconds)
    try:
        redis = get_redis()
        key = delayed_key(queue_key(job.kind))
        await redis.zadd(key, {job.to_json(): ready_at})
    except Exception:
        logger.warning("Falha ao agendar retry kind=%s", job.kind, exc_info=True)


async def move_due_jobs(kind: str, now: float | None = None) -> int:
    """Move da fila de delay para a principal os jobs cujo ready_at venceu."""
    key = queue_key(kind)
    ref = time.time() if now is None else now
    moved = 0
    try:
        redis = get_redis()
        dkey = delayed_key(key)
        due = await redis.zrangebyscore(dkey, 0, ref, start=0, num=50)
        for raw in due:
            if await redis.zrem(dkey, raw):
                await redis.rpush(key, raw)
                moved += 1
    except Exception:
        logger.warning("Falha ao mover jobs atrasados kind=%s", kind, exc_info=True)
        return 0
    if moved:
        try:
            depth = int(await get_redis().llen(key))
            metrics.QUEUE_DEPTH.labels(queue=kind).set(depth)
        except Exception:
            pass
    return moved


async def push_dead_letter(job: Job, error: str) -> None:
    """Move esgotou tentativas para a dead-letter (DLQ), com limite de tamanho."""
    job.last_error = error[:500]
    key = dead_letter_key(job.kind)
    try:
        redis = get_redis()
        await redis.lpush(key, job.to_json())
        # Mantém só as N mais recentes para a DLQ não crescer sem limite.
        await redis.ltrim(key, 0, max(10, settings.email_max_attempts * 20))
        metrics.EMAIL_DEAD_LETTER.inc()
    except Exception:
        logger.error("Falha ao gravar dead-letter kind=%s", job.kind, exc_info=True)
    logger.error("Job %s (%s) movido para dead-letter: %s", job.id, job.kind, error)


async def dead_letter_jobs(kind: str) -> list[Job]:
    """Leitura da DLQ (operações/manutenção)."""
    try:
        raws = await get_redis().lrange(dead_letter_key(kind), 0, -1)
    except Exception:
        return []
    jobs: list[Job] = []
    for raw in raws or []:
        try:
            jobs.append(Job.from_json(raw))
        except (ValueError, TypeError):
            continue
    return jobs


async def queue_depth(kind: str) -> int:
    try:
        return int(await get_redis().llen(queue_key(kind)))
    except Exception:
        return 0


def retry_delay(attempt: int, base: float | None = None) -> float:
    """Backoff exponencial com jitter: base * 2**(n-1) ± 25 %."""
    factor = base if base is not None else settings.email_retry_base_seconds
    delay = factor * (2 ** max(0, attempt - 1))
    return max(0.1, delay * random.uniform(0.75, 1.25))


async def process_with_retries(job: Job | None, handler: Handler) -> str:
    """Executa ``handler`` com retentativas.

    Devolve o desfecho: ``"ok"``, ``"retry"``, ``"dead"`` ou ``"empty"``.
    Retentativas são agendadas (ZSET) — o worker nunca dorme segurando o job.
    """
    if job is None:
        return "empty"

    try:
        await handler(job)
    except Exception as exc:  # noqa: BLE001 - qualquer erro vira retentativa
        if job.attempts >= job.max_attempts:
            await push_dead_letter(job, f"{type(exc).__name__}: {exc}")
            return "dead"
        delay = retry_delay(job.attempts)
        job.attempts += 1
        job.last_error = f"{type(exc).__name__}: {exc}"[:500]
        await schedule_retry(job, delay)
        metrics.EMAIL_FAILED.inc()
        logger.warning(
            "Job %s falhou (tentativa %d/%d) retry em %.1fs: %s",
            job.id,
            job.attempts - 1,
            job.max_attempts,
            delay,
            exc,
        )
        return "retry"

    if job.kind == EMAIL_KIND:
        metrics.EMAIL_SENT.inc()
    return "ok"
