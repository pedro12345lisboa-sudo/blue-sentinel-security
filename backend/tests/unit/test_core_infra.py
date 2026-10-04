"""Infraestrutura transversal: logging, ciclo de vida do engine/Redis e handlers mortos."""

from __future__ import annotations

import logging

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.errors import database_error_handler, http_exception_handler


def _scope_request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": []})


def test_setup_logging_installs_json_intercept_handler(capsys):
    from app.core.logging import InterceptHandler, setup_logging

    root = logging.getLogger()
    saved_handlers = list(root.handlers)
    saved_level = root.level
    try:
        setup_logging()
        assert root.level == logging.INFO
        assert any(isinstance(h, InterceptHandler) for h in root.handlers)

        root.info("mensagem de teste")
        captured = capsys.readouterr()
        assert '"message": "mensagem de teste"' in captured.err
        assert '"level": "INFO"' in captured.err
    finally:
        root.handlers[:] = saved_handlers
        root.level = saved_level


async def test_init_db_is_idempotent():
    from app.database.session import init_db

    await init_db()
    await init_db()  # segunda chamada não pode falhar


async def test_get_db_yields_session_and_closes():
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.database.session import get_db

    agen = get_db()
    session = await agen.__anext__()
    assert isinstance(session, AsyncSession)
    await agen.aclose()  # dispara o finally (session.close)


async def test_dispose_engine_is_safe():
    from app.database.session import dispose_engine

    await dispose_engine()


async def test_get_redis_is_singleton_and_close_handles_paths():
    from fakeredis import FakeAsyncRedis

    from app.cache import redis as redis_module

    redis_module.set_redis(None)
    first = redis_module.get_redis()
    assert redis_module.get_redis() is first

    await redis_module.close_redis()
    assert redis_module._client is None

    await redis_module.close_redis()  # idempotente quando não há cliente

    class _Broken:
        async def aclose(self):
            raise ConnectionError("fechamento falhou")

    redis_module.set_redis(_Broken())  # type: ignore[arg-type]
    await redis_module.close_redis()
    assert redis_module._client is None

    redis_module.set_redis(FakeAsyncRedis(decode_responses=True))


async def test_http_exception_handler_keeps_headers_and_codes():
    exc = HTTPException(
        status_code=401, detail="token inválido", headers={"WWW-Authenticate": "Bearer"}
    )
    resp = await http_exception_handler(_scope_request(), exc)
    assert resp.status_code == 401
    assert resp.headers["WWW-Authenticate"] == "Bearer"
    body = resp.body.decode()
    # helper legado (não registrado): detalhe simples vira HTTP_ERROR
    assert '"error":"HTTP_ERROR"' in body
    assert '"message":"token inválido"' in body


async def test_http_exception_handler_dict_detail():
    exc = HTTPException(403, detail={"code": "FORBIDDEN", "message": "negado"})
    resp = await http_exception_handler(_scope_request(), exc)
    body = resp.body.decode()
    assert '"error":"FORBIDDEN"' in body
    assert '"message":"negado"' in body


async def test_database_error_handler_returns_500_envelope():
    resp = await database_error_handler(_scope_request(), RuntimeError("x"))
    assert resp.status_code == 500
    body = resp.body.decode()
    assert '"error":"INTERNAL_ERROR"' in body
    assert "Traceback" not in body
