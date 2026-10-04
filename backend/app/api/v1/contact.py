import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Request, status
from fastapi.responses import JSONResponse

from app.cache.redis import get_redis
from app.core.deps import get_db_session
from app.core.errors import BlueSentinelError, RateLimitError
from app.middleware.rate_limit import FailureMode, SlidingWindowRateLimiter
from app.schemas.contact import ContactRequest, ContactAccepted
from app.schemas.common import ErrorResponse, problem_response
from app.services.contact_service import ContactService
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contact", tags=["contact"])

# Limite por IP em janela deslizante (Redis). Camada barata na borda; o limite
# por e-mail no banco (5/hora) continua como defesa da última linha.
CONTACT_IP_RATE_LIMIT = 10
CONTACT_IP_RATE_WINDOW_SECONDS = 60

contact_ip_limiter = SlidingWindowRateLimiter(
    get_redis(),
    limit=CONTACT_IP_RATE_LIMIT,
    window_seconds=CONTACT_IP_RATE_WINDOW_SECONDS,
    failure_mode=FailureMode.from_settings(),
)


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ContactAccepted,
    responses={
        429: problem_response("Rate limit exceeded"),
        400: problem_response("Request rejected"),
        422: problem_response("Validation error"),
    },
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
        await contact_ip_limiter.enforce(f"contact-ip:{client_ip}")
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
                code=exc.code,
                detail=exc.message,
            ).model_dump(),
            headers={"Retry-After": str(exc.retry_after)},
        )
    except BlueSentinelError as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                title="Request Error",
                status=exc.status_code,
                code=exc.code,
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
