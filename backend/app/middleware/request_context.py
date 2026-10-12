"""Middleware de contexto de request: ``request_id``, log estruturado e métricas.

Cada requisição HTTP passa por aqui uma única vez e produz:

* ``request_id`` propagado no ``ContextVar`` (log), em ``request.state`` e no
  header de resposta ``X-Request-ID``;
* uma linha de log JSON com nível, rota, status e latência — **sem** query
  string, corpo ou IP do cliente;
* métricas de latência/erro por rota + contadores de 401/429 por rota;
* o evento de "dogfooding" entregue ao motor de detecção
  (:mod:`app.monitoring.security_events`).
"""

from __future__ import annotations

import logging
import re
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import request_id_var
from app.monitoring import alerts, metrics, security_events

logger = logging.getLogger("app.request")

# Só aceitamos um request_id vindo de fora se for "seguro" (anti-log-forging).
REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def new_request_id() -> str:
    return uuid.uuid4().hex[:12]


def _status_level(status: int) -> int:
    if status >= 500:
        return logging.ERROR
    if status >= 400:
        return logging.WARNING
    return logging.INFO


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Atribui ``request_id``, registra a requisição e alimenta métricas."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if REQUEST_ID_RE.match(incoming) else new_request_id()
        token = request_id_var.set(request_id)
        request.state.request_id = request_id

        path = request.url.path  # nunca a query string (pode conter tokens)
        method = request.method
        started = time.perf_counter()
        responded = False

        try:
            response = await call_next(request)
            responded = True
            response.headers["X-Request-ID"] = request_id
            return response
        except Exception:
            # O handler global (ServerErrorMiddleware) está acima daqui e vai
            # responder 500; registramos mesmo assim para log/métrica sair.
            self._record(request, request_id, method, path, 500, started)
            raise
        finally:
            if responded:
                self._record(request, request_id, method, path, response.status_code, started)
            request_id_var.reset(token)

    @staticmethod
    def _record(
        request: Request,
        request_id: str,
        method: str,
        path: str,
        status: int,
        started: float,
    ) -> None:
        duration = time.perf_counter() - started
        route = metrics.normalize_path(path)

        if not path.startswith("/metrics"):
            metrics.observe_request(method, path, status, duration)
            if status == 429:
                metrics.RATE_LIMITED.labels(path=route).inc()
            elif status == 401:
                metrics.AUTH_FAILURES.labels(path=route).inc()

            # Dogfooding: 401/404/429 do próprio site entram no motor de detecção.
            client_ip = request.client.host if request.client else "unknown"
            security_events.observe(status=status, path=path, ip=client_ip)
            # Janela deslizante usada pelos alertas de pico de 401/429.
            alerts.record_request(status=status)

        extra = {
            "request_id": request_id,
            "method": method,
            "route": route,
            "path": path,
            "status": status,
            "duration_ms": round(duration * 1000, 2),
        }
        logger.log(_status_level(status), "%s %s -> %s", method, path, status, extra=extra)
