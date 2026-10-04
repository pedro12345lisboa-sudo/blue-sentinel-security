import logging
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from app.core.config import settings
from app.core.errors import BlueSentinelError, RateLimitError, ValidationError
from app.models.contact_message import ContactMessage
from app.schemas.contact import ContactRequest, ContactAccepted
from app.security.sql_injection import UnsafeSortError, apply_sort

logger = logging.getLogger(__name__)

CONTACT_RATE_LIMIT = 5  # per hour per email

# Allowlist de ordenação do endpoint de listagem: só colunas mapeadas aqui
# podem aparecer em ORDER BY (o resto é rejeitado antes de tocar o banco).
MESSAGE_SORTABLE: dict[str, ColumnElement] = {
    "created_at": ContactMessage.created_at,
    "id": ContactMessage.id,
    "subject": ContactMessage.subject,
    "email": ContactMessage.email,
}
MESSAGE_SORT_DEFAULT = "created_at"


class ContactService:
    """Business logic for contact form submissions."""

    @staticmethod
    async def submit(
        data: ContactRequest,
        db: AsyncSession,
        client_ip: str,
        user_agent: str | None = None,
    ) -> ContactAccepted:
        request_id = uuid.uuid4().hex[:12]

        # Honeypot: silently accept but discard (never reveal detection)
        if data.honeypot.strip():
            logger.warning("Honeypot triggered ip=%s", client_ip)
            return ContactAccepted(id=0, status="ignored", request_id=request_id)

        # Rate limit per email per hour
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        count = await db.scalar(
            select(func.count())
            .select_from(ContactMessage)
            .where(
                ContactMessage.email == data.email,
                ContactMessage.created_at >= one_hour_ago,
            )
        )
        if (count or 0) >= CONTACT_RATE_LIMIT:
            raise RateLimitError(retry_after=3600)

        msg = ContactMessage(
            name=data.name,
            email=data.email,
            subject=data.subject,
            message=data.message,
            ip_address=client_ip,
            user_agent=user_agent,
            status="new",
            read=False,
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)

        logger.info("Contact saved id=%s ip=%s", msg.id, client_ip)
        return ContactAccepted(id=msg.id, status="queued", request_id=request_id)

    @staticmethod
    async def list_messages(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 50,
        sort: str | None = None,
        direction: str | None = None,
    ) -> tuple[list[ContactMessage], int]:
        # Valida a ordenação ANTES de tocar no banco (allowlist anti-injection)
        try:
            stmt = apply_sort(
                select(ContactMessage),
                sort=sort,
                direction=direction,
                allowed=MESSAGE_SORTABLE,
                default=MESSAGE_SORT_DEFAULT,
            )
        except UnsafeSortError as exc:
            raise ValidationError(str(exc)) from exc

        total = await db.scalar(
            select(func.count()).select_from(ContactMessage)
        )
        result = await db.execute(
            stmt.offset(skip).limit(min(limit, 100))
        )
        return list(result.scalars().all()), total or 0

    @staticmethod
    async def mark_read(
        db: AsyncSession,
        message_ids: list[int],
    ) -> int:
        from sqlalchemy import update
        result = await db.execute(
            update(ContactMessage)
            .where(ContactMessage.id.in_(message_ids))
            .values(read=True, updated_at=datetime.now(timezone.utc))
        )
        await db.commit()
        return result.rowcount
