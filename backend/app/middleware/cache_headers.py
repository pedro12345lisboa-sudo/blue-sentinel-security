"""Cabeçalhos ``Cache-Control`` por classe de rota.

Regras (ver docs/architecture/performance.md):

======================================  =========================================
Rota                                    Cache-Control
======================================  =========================================
``/api/v1/github/stats``                ``public, max-age=60, stale-while-revalidate=600``
``/api/v1/health/*``, ``/status``       ``no-store``
``/api/v1/admin/*``, ``/auth/*``        ``no-store``
``/metrics``                            ``no-store``
demais rotas da API                     ``no-store``
======================================  =========================================

Nada aqui depende de Redis: os cabeçalhos são calculados localmente, então a
página continua correta mesmo com o backend degradado.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Prefixos com política própria (o resto da API é sempre revalidado).
PUBLIC_PREFIXES: dict[str, str] = {
    "/api/v1/github/stats": "public, max-age=60, stale-while-revalidate=600",
}

NO_STORE_PREFIXES = (
    "/api/v1/health",
    "/api/v1/status",
    "/api/v1/admin",
    "/api/v1/auth",
    "/metrics",
    "/docs",
    "/redoc",
    "/openapi.json",
)

DEFAULT_API_CACHE_CONTROL = "no-store"


def cache_control_for(path: str) -> str | None:
    """Política de cache para um caminho (``None`` = não tocar no header)."""
    for prefix, value in PUBLIC_PREFIXES.items():
        if path.startswith(prefix):
            return value
    if path.startswith("/api/") or path.startswith(NO_STORE_PREFIXES):
        return DEFAULT_API_CACHE_CONTROL
    if path.startswith(("/_next/", "/static/")):
        return "public, max-age=31536000, immutable"
    return None


class CacheControlMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        policy = cache_control_for(request.url.path)
        if policy and "cache-control" not in response.headers:
            response.headers["Cache-Control"] = policy
        return response
