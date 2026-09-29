import logging

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_db_session, get_current_user, require_admin
from app.schemas.auth import (
    MarkReadRequest,
    MarkReadResponse,
    MessageListResponse,
    MessageSummary,
)
from app.services.contact_service import ContactService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get(
    "/messages",
    response_model=MessageListResponse,
    dependencies=[Depends(require_admin)],
)
async def list_messages(
    skip: int = Query(0, ge=0, le=1000),
    limit: int = Query(50, ge=1, le=100),
    db=Depends(get_db_session),
    _user=Depends(get_current_user),
):
    """Lista mensagens de contato (paginado, admin only)."""
    items, total = await ContactService.list_messages(db, skip=skip, limit=limit)
    return MessageListResponse(
        items=[
            MessageSummary(
                id=m.id,
                name=m.name,
                email=m.email,
                subject=m.subject,
                read=m.read,
                created_at=m.created_at,
            )
            for m in items
        ],
        total=total,
    )


@router.post(
    "/messages/read",
    response_model=MarkReadResponse,
    dependencies=[Depends(require_admin)],
)
async def mark_messages_read(
    payload: MarkReadRequest,
    db=Depends(get_db_session),
    _user=Depends(get_current_user),
):
    """Marca mensagens como lidas (admin only)."""
    updated = await ContactService.mark_read(db, payload.message_ids)
    return MarkReadResponse(updated=updated)
