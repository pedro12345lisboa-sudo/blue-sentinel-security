"""Cabeçalhos de segurança de respostas HTTP da API.

O backend é uma API, não um site indexável: toda resposta carrega
``X-Robots-Tag: noindex, nofollow`` para que buscadores não indexem
``/api/v1/*`` (inclusive ``/admin``, ``/auth``, ``/docs``), combinado com o
``Disallow: /api/`` do ``robots.txt`` do frontend.

Também aplica um baseline defensivo de cabeçalhos (sem dependência de
Redis/banco — a política é 100% local, como o ``cache_headers``).
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

# API não é conteúdo para buscador.
ROBOTS_TAG = "noindex, nofollow, noarchive"

# Baseline defensivo: nada aqui permite execução remota, só restringe.
SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": ROBOTS_TAG,
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Aplica ``SECURITY_HEADERS`` sem sobrescrever valores já definidos."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        return response
