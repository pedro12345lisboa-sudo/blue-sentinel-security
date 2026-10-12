"""Baseline de cabeçalhos de segurança (noindex + defensivo) da API."""

from __future__ import annotations

from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.middleware.security_headers import ROBOTS_TAG, SECURITY_HEADERS, SecurityHeadersMiddleware


async def _ok(request):
    return JSONResponse({"ok": True})


def _client() -> TestClient:
    app = Starlette(routes=[Route("/api/v1/health/live", _ok)])
    app.add_middleware(SecurityHeadersMiddleware)
    return TestClient(app)


def test_api_responses_are_not_indexable():
    response = _client().get("/api/v1/health/live")
    assert response.status_code == 200
    assert response.headers["x-robots-tag"] == ROBOTS_TAG
    assert "noindex" in response.headers["x-robots-tag"]


def test_defensive_headers_are_present():
    response = _client().get("/api/v1/health/live")
    for name, value in SECURITY_HEADERS.items():
        assert response.headers[name.lower()] == value


def test_existing_header_is_not_overwritten():
    async def override(request):
        return JSONResponse({}, headers={"X-Robots-Tag": "custom"})

    app = Starlette(routes=[Route("/", override)])
    app.add_middleware(SecurityHeadersMiddleware)
    response = TestClient(app).get("/")
    assert response.headers["x-robots-tag"] == "custom"
