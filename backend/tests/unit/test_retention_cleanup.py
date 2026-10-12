"""Retenção LGPD: exclusão automática após o prazo declarado."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.models.contact_message import ContactMessage
from app.models.lab_session import LabSession
from app.workers.cleanup.old_events_cleanup import run_retention_cleanup
from tests.factories import create_contact_message, create_lab_session


async def test_cleanup_removes_expired_records_only(db_session):
    now = datetime.now(timezone.utc)
    old_contact = await create_contact_message(
        db_session,
        created_at=(now - timedelta(days=settings.contact_retention_days + 10)).replace(
            tzinfo=None
        ),
    )
    fresh_contact = await create_contact_message(db_session)

    fresh_session = await create_lab_session(db_session, ttl_seconds=3600)
    expired_session = await create_lab_session(db_session, ttl_seconds=1)
    expired_session.expires_at = now - timedelta(days=settings.lab_session_retention_days + 5)
    await db_session.commit()

    counts = await run_retention_cleanup(db_session)
    assert counts == {"contact_messages": 1, "lab_sessions": 1}

    contacts = (await db_session.execute(select(ContactMessage))).scalars().all()
    assert [message.id for message in contacts] == [fresh_contact.id]
    assert old_contact.id not in [message.id for message in contacts]

    sessions = (await db_session.execute(select(LabSession))).scalars().all()
    assert [session.id for session in sessions] == [fresh_session.id]


async def test_cleanup_keeps_everything_inside_the_window(db_session):
    await create_contact_message(db_session)  # criada agora
    session = await create_lab_session(db_session, ttl_seconds=3600)
    session.expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    await db_session.commit()

    counts = await run_retention_cleanup(db_session)
    assert counts == {"contact_messages": 0, "lab_sessions": 0}
    assert len((await db_session.execute(select(ContactMessage))).scalars().all()) == 1
    assert len((await db_session.execute(select(LabSession))).scalars().all()) == 1


async def test_cleanup_without_session_uses_app_session_maker():
    """O caminho do lifespan (sem sessão explícita) funciona ponta a ponta."""
    counts = await run_retention_cleanup()
    assert set(counts) == {"contact_messages", "lab_sessions"}
