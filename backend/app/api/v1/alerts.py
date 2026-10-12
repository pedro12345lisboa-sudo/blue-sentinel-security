"""Webhook do Alertmanager: ``POST /api/v1/alerts/webhook``.

O Prometheus avalia as regras de ``docker/prometheus/alert.rules.yml`` e o
Alertmanager despacha para aqui. O backend reaplica deduplicação e
silêncio, acrescenta o link de runbook e reentrega nos canais
(webhook Discord/Telegram + e-mail) — um único ponto de notificação.

Segurança: o endpoint exige ``ALERT_WEBHOOK_TOKEN`` (comparação em tempo
constante). Sem token configurado o endpoint fica **fechado** (403).
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.monitoring.alerts import from_alertmanager, notifier
from app.schemas.common import ErrorResponse, problem_response

router = APIRouter(prefix="/alerts", tags=["monitoring"])


class WebhookAck(BaseModel):
    accepted: int = Field(ge=0)
    forwarded: int = Field(ge=0)


def _problem(status: int, code: str, title: str) -> JSONResponse:
    body = ErrorResponse(title=title, status=status, code=code).model_dump()
    return JSONResponse(
        status_code=status, media_type="application/problem+json", content=body
    )


def _provided_token(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return request.headers.get("x-alert-token", "").strip()


@router.post(
    "/webhook",
    summary="Recebe alertas do Alertmanager",
    response_model=WebhookAck,
    responses={
        403: problem_response("ALERT_WEBHOOK_TOKEN ausente ou inválido"),
        400: problem_response("Payload inválido"),
    },
)
async def alertmanager_webhook(request: Request) -> WebhookAck:
    expected = settings.alert_webhook_token
    if not expected or not secrets.compare_digest(_provided_token(request), expected):
        return _problem(403, "FORBIDDEN", "Forbidden")

    try:
        payload = await request.json()
    except Exception:
        return _problem(400, "INVALID_PAYLOAD", "Invalid Payload")

    alerts = from_alertmanager(payload if isinstance(payload, dict) else {})
    forwarded = 0
    for alert in alerts:
        if await notifier.notify(alert):
            forwarded += 1
    return {"accepted": len(alerts), "forwarded": forwarded}
