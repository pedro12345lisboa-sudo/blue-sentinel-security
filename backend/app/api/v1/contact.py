import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Request, status
from fastapi.responses import JSONResponse

from app.core.deps import get_db_session
from app.core.errors import BlueSentinelError, RateLimitError
from app.schemas.contact import ContactRequest, ContactAccepted
from app.schemas.common import ErrorResponse
from app.services.contact_service import ContactService
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contact", tags=["contact"])


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ContactAccepted,
    responses={429: {"model": ErrorResponse}, 400: {"model": ErrorResponse}},
)
async def submit_contact(
    payload: ContactRequest,
    request: Request,
    background: BackgroundTasks,
    db=Depends(get_db_session),
):
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent")

    try:
        accepted = await ContactService.submit(
            data=payload,
            db=db,
            client_ip=client_ip,
            user_agent=user_agent,
        )
    except RateLimitError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                title="Too Many Requests",
                status=exc.status_code,
                detail="Limite de mensagens atingido. Tente novamente mais tarde.",
            ).model_dump(),
            headers={"Retry-After": str(exc.retry_after)},
        )
    except BlueSentinelError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                title="Request Error",
                status=exc.status_code,
                detail=exc.message,
            ).model_dump(),
        )

    # Queue e-mail delivery (worker stage will consume this)
    if accepted.status == "queued":
        background.add_task(
            EmailService.send_contact_notification,
            name=payload.name,
            email=payload.email,
            subject=payload.subject,
            message=payload.message,
        )

    return accepted
