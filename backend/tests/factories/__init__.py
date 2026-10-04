"""Plain factory helpers (no framework) — sem PII real, sequências determinísticas.

Regra do projeto: tudo usa ``example.com`` / IPs de documentação (RFC 5737)
para nunca gravar dados pessoais reais no banco de testes.
"""

from __future__ import annotations

import itertools
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import create_access_token, pwd_context
from app.models.admin_user import AdminUser
from app.models.contact_message import ContactMessage
from app.models.lab_session import LabSession

_seq = itertools.count(1)

DEFAULT_PASSWORD = "Str0ng!Test#Pass"


def next_id() -> int:
    return next(_seq)


def make_contact_message(**overrides: Any) -> ContactMessage:
    n = next_id()
    defaults: dict[str, Any] = {
        "name": f"Teste {n}",
        "email": f"tester{n}@example.com",
        "subject": "Assunto de teste",
        "message": "Mensagem de teste suficientemente longa para validação.",
        "honeypot": "",
        "ip_address": "203.0.113.10",
        "user_agent": "pytest",
        "status": "new",
        "read": False,
    }
    defaults.update(overrides)
    return ContactMessage(**defaults)


async def create_contact_message(
    db: AsyncSession, *, commit: bool = True, **overrides: Any
) -> ContactMessage:
    msg = make_contact_message(**overrides)
    db.add(msg)
    if commit:
        await db.commit()
        await db.refresh(msg)
    return msg


def contact_payload(**overrides: Any) -> dict[str, Any]:
    """Corpo JSON válido para POST /api/v1/contact."""
    n = next_id()
    defaults: dict[str, Any] = {
        "name": f"Teste {n}",
        "email": f"tester{n}@example.com",
        "subject": "Assunto de teste",
        "message": "Mensagem de teste suficientemente longa para validação.",
    }
    defaults.update(overrides)
    return defaults


async def create_admin_user(
    db: AsyncSession,
    *,
    username: str | None = None,
    password: str = DEFAULT_PASSWORD,
    is_superuser: bool = True,
    is_active: bool = True,
    commit: bool = True,
) -> AdminUser:
    n = next_id()
    user = AdminUser(
        username=username or f"admin{n}",
        email=f"admin{n}@example.com",
        hashed_password=pwd_context.hash(password),
        is_active=is_active,
        is_superuser=is_superuser,
    )
    db.add(user)
    if commit:
        await db.commit()
        await db.refresh(user)
    return user


def auth_headers(user: AdminUser) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


async def create_lab_session(
    db: AsyncSession,
    *,
    ip_address: str = "203.0.113.20",
    ttl_seconds: int = 1800,
    status: str = "active",
    session_token: str | None = None,
    commit: bool = True,
) -> LabSession:
    n = next_id()
    session = LabSession(
        session_token=session_token or f"tok-{n}-{next_id()}",
        ip_address=ip_address,
        user_agent="pytest",
        status=status,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
    )
    db.add(session)
    if commit:
        await db.commit()
        await db.refresh(session)
    return session
