"""Retenção de dados (LGPD): exclusão automática após o prazo declarado.

Base legal e prazos descritos em ``frontend/content/{pt,en}/privacy.mdx`` e
inventariados em ``docs/security/data-inventory.md``:

===========================  ==========================================
Dados                        Prazo
===========================  ==========================================
Mensagens do formulário      ``CONTACT_RETENTION_DAYS`` (padrão 90 dias)
Sessões do laboratório       ``LAB_SESSION_RETENTION_DAYS`` (padrão 30)
===========================  ==========================================

A rotina roda a cada ``CLEANUP_INTERVAL_HOURS`` (lifespan do app) e também
sob demanda — :func:`run_retention_cleanup` é o que os testes exercitam.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.session import async_session_maker
from app.models.contact_message import ContactMessage
from app.models.lab_session import LabSession
from app.monitoring import metrics

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _naive_utc(value: datetime) -> datetime:
    """``contact_messages.created_at`` é ``timestamp without time zone``."""
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _aware_utc(value: datetime) -> datetime:
    """``lab_sessions.expires_at`` é ``timestamp with time zone``."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def cleanup_expired_contact_messages(
    db: AsyncSession, now: datetime | None = None
) -> int:
    """Apaga mensagens de contato além do prazo de retenção."""
    cutoff = _naive_utc(now or _utcnow()) - timedelta(
        days=max(settings.contact_retention_days, 1)
    )
    result = await db.execute(
        delete(ContactMessage)
        .where(ContactMessage.created_at < cutoff)
        .execution_options(synchronize_session=False)
    )
    removed = result.rowcount or 0
    if removed:
        metrics.CLEANUP_REMOVED.labels(kind="contact_messages").inc(removed)
        await db.commit()
    return int(removed)


async def cleanup_expired_lab_sessions(db: AsyncSession, now: datetime | None = None) -> int:
    """Apaga sessões do laboratório além do prazo de retenção."""
    cutoff = _aware_utc(now or _utcnow()) - timedelta(
        days=max(settings.lab_session_retention_days, 1)
    )
    result = await db.execute(
        delete(LabSession)
        .where(LabSession.expires_at < cutoff)
        .execution_options(synchronize_session=False)
    )
    removed = result.rowcount or 0
    if removed:
        metrics.CLEANUP_REMOVED.labels(kind="lab_sessions").inc(removed)
        await db.commit()
    return int(removed)


async def run_retention_cleanup(
    db: AsyncSession | None = None, now: datetime | None = None
) -> dict[str, int]:
    """Executa todos os ciclos de retenção; retorna quantos registros saíram."""
    if db is not None:
        counts = {
            "contact_messages": await cleanup_expired_contact_messages(db, now),
            "lab_sessions": await cleanup_expired_lab_sessions(db, now),
        }
        logger.info(
            "Retenção LGPD executada contact_messages=%s lab_sessions=%s",
            counts["contact_messages"],
            counts["lab_sessions"],
        )
        return counts

    async with async_session_maker() as session:
        counts = {
            "contact_messages": await cleanup_expired_contact_messages(session, now),
            "lab_sessions": await cleanup_expired_lab_sessions(session, now),
        }
    logger.info(
        "Retenção LGPD executada contact_messages=%s lab_sessions=%s",
        counts["contact_messages"],
        counts["lab_sessions"],
    )
    return counts
