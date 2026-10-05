"""Endpoint ``/metrics`` (Prometheus) — sempre protegido por token.

Regras:

* ``METRICS_TOKEN`` vazio ⇒ endpoint **desabilitado** (403), nunca exposto
  por engano.
* Token enviado via ``Authorization: Bearer <token>`` ou ``X-Metrics-Token``.
* Comparação em tempo constante (``secrets.compare_digest``).
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Request
from fastapi.responses import Response

from app.core.config import settings
from app.monitoring import metrics

router = APIRouter(tags=["monitoring"])

PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8"


def extract_token(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return request.headers.get("x-metrics-token", "").strip()


def is_authorized(request: Request) -> bool:
    expected = settings.metrics_token
    if not expected:
        return False
    return secrets.compare_digest(extract_token(request), expected)


@router.get("/metrics", response_class=Response, summary="Métricas Prometheus (protegido)")
async def prometheus_metrics(request: Request):
    if not is_authorized(request):
        return Response(status_code=403, content="forbidden", media_type="text/plain")
    return Response(
        content=metrics.render(),
        media_type=PROMETHEUS_CONTENT_TYPE,
        headers={"Cache-Control": "no-store"},
    )
