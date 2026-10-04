"""Handlers globais do app: 422, 500 e contrato de mídia problem+json."""

from __future__ import annotations

from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.requests import Request

from main import STATUS_CODES, generic_handler, http_handler, validation_handler


def _request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": []})


async def test_generic_error_handler_hides_internals():
    resp = await generic_handler(_request(), RuntimeError("boom com senha secreta"))
    assert resp.status_code == 500
    assert resp.media_type == "application/problem+json"
    assert b'"code":"INTERNAL_ERROR"' in resp.body
    assert b"senha" not in resp.body
    assert b"Traceback" not in resp.body


async def test_http_handler_maps_dict_detail_to_code_and_message():
    resp = await http_handler(
        _request(),
        HTTPException(403, detail={"code": "FORBIDDEN", "message": "negado"}),
    )
    assert resp.status_code == 403
    assert b'"code":"FORBIDDEN"' in resp.body
    assert b'"detail":"negado"' in resp.body


async def test_http_handler_plain_detail_uses_status_map():
    resp = await http_handler(_request(), HTTPException(404, detail="caminho sumiu"))
    assert resp.status_code == 404
    assert b'"code":"NOT_FOUND"' in resp.body
    assert b'"detail":"caminho sumiu"' in resp.body


async def test_http_handler_unknown_status_uses_fallback_code():
    resp = await http_handler(_request(), HTTPException(418, detail="teapot"))
    assert resp.status_code == 418
    assert b"HTTP_ERROR" in resp.body


async def test_validation_handler_joins_messages():
    exc = RequestValidationError(
        [
            {"loc": ("body", "name"), "msg": "Field required", "type": "missing"},
            {"loc": ("body", "email"), "msg": "Invalid email", "type": "value_error"},
        ]
    )
    resp = await validation_handler(_request(), exc)
    assert resp.status_code == 422
    assert b"body.name: Field required" in resp.body
    assert b"body.email: Invalid email" in resp.body


def test_status_codes_map_is_complete():
    for expected in (400, 401, 403, 404, 405, 408, 409, 422, 429, 500, 503):
        assert expected in STATUS_CODES


async def test_unhandled_exception_returns_problem_json_not_stack(client):
    from httpx import ASGITransport, AsyncClient

    from app.services.contact_service import ContactService

    async def _boom(*_a, **_k):
        raise RuntimeError("traceback secreta")

    original = ContactService.submit
    ContactService.submit = staticmethod(_boom)
    try:
        transport = ASGITransport(app=__import__("main").app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
            resp = await ac.post(
                "/api/v1/contact",
                json={
                    "name": "Ana",
                    "email": "ana@example.com",
                    "subject": "oi",
                    "message": "mensagem de teste suficientemente longa",
                },
            )
    finally:
        ContactService.submit = original

    assert resp.status_code == 500
    body = resp.json()
    assert body["code"] == "INTERNAL_ERROR"
    assert "traceback" not in body["detail"].lower()


async def test_docs_and_openapi_available(client):
    assert (await client.get("/openapi.json")).status_code == 200
    assert (await client.get("/api/v1/docs")).status_code == 200
