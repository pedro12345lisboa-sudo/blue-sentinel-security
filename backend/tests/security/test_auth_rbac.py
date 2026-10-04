"""Camada de segurança: JWT inválido/expirado/alterado e RBAC do painel admin.

Cobre os vetores exigidos pela política de testes:
- token expirado, assinado com outra chave, payload adulterado, ``alg: none``
  e ``sub`` não numérico são rejeitados (401 problem+json);
- usuário autenticado sem ``is_superuser`` recebe 403 em toda rota admin;
- usuário inexistente/inativo não autentica (401) — a verificação de papel
  só acontece depois de um token válido.
"""

from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from app.api.v1.auth import ALGORITHM, create_access_token, decode_token
from app.core.config import settings
from tests.factories import auth_headers, create_admin_user

ADMIN_LIST = "/api/v1/admin/messages"
ADMIN_READ = "/api/v1/admin/messages/read"


def _b64(data: dict) -> str:
    raw = json.dumps(data, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _token(payload: dict, key: str | None = None) -> str:
    return jwt.encode(payload, key or settings.secret_key, algorithm=ALGORITHM)


def _expired_token(user_id: int = 1) -> str:
    now = datetime.now(timezone.utc)
    return _token(
        {
            "sub": str(user_id),
            "iat": now - timedelta(hours=2),
            "exp": now - timedelta(hours=1),
        }
    )


def _alg_none_token(user_id: int = 1) -> str:
    now = int(datetime.now(timezone.utc).timestamp())
    header = _b64({"alg": "none", "typ": "JWT"})
    body = _b64({"sub": str(user_id), "iat": now, "exp": now + 3600})
    return f"{header}.{body}."


async def test_decode_token_rejects_bad_tokens():
    assert decode_token(_expired_token(7)) is None
    assert decode_token(_token({"sub": "7"}, key="outra-chave-secreta")) is None
    assert decode_token(_alg_none_token(7)) is None
    assert decode_token(_token({"sub": "nao-e-numero"})) is None
    assert decode_token(_token({"sem-sub": 1})) is None

    valid = create_access_token(7)
    assert valid.count(".") == 2
    assert decode_token(f"{valid[:-4]}ZZZZ") is None
    assert decode_token("token-invalido") is None


@pytest.mark.parametrize(
    "build",
    [
        pytest.param(lambda: _expired_token(1), id="expirado"),
        pytest.param(lambda: _token({"sub": "1"}, key="chave-errada"), id="assinatura-invalida"),
        pytest.param(lambda: _alg_none_token(1), id="alg-none"),
        pytest.param(lambda: _token({"sub": "abc"}), id="sub-nao-numerico"),
        pytest.param(lambda: "Bearer-como-token", id="lixo"),
    ],
)
async def test_admin_rejects_invalid_tokens(client, build):
    resp = await client.get(
        ADMIN_LIST, headers={"Authorization": f"Bearer {build()}"}
    )

    assert resp.status_code == 401
    assert resp.headers["content-type"].startswith("application/problem+json")
    assert resp.headers.get("www-authenticate") == "Bearer"
    body = resp.json()
    assert body["code"] == "UNAUTHORIZED"
    assert body["status"] == 401
    assert body["title"] == "Unauthorized"


async def test_admin_missing_token_is_401_not_403(client):
    resp = await client.get(ADMIN_LIST)

    assert resp.status_code == 401
    assert resp.json()["code"] == "UNAUTHORIZED"


async def test_rbac_non_superuser_is_forbidden_on_every_admin_route(client, db_session):
    user = await create_admin_user(db_session, is_superuser=False)
    headers = auth_headers(user)

    listing = await client.get(ADMIN_LIST, headers=headers)
    assert listing.status_code == 403
    assert listing.headers["content-type"].startswith("application/problem+json")
    body = listing.json()
    assert body["code"] == "FORBIDDEN"
    assert body["status"] == 403
    assert body["title"] == "Forbidden"
    assert body["detail"] == "Administrator permission required"
    assert "request_id" in body

    marked = await client.post(
        ADMIN_READ, json={"message_ids": [1]}, headers=headers
    )
    assert marked.status_code == 403
    assert marked.json()["code"] == "FORBIDDEN"


async def test_rbac_inactive_user_cannot_authenticate(client, db_session):
    user = await create_admin_user(db_session, is_active=False, is_superuser=True)

    resp = await client.get(ADMIN_LIST, headers=auth_headers(user))

    assert resp.status_code == 401
    assert resp.json()["detail"] == "User not found or inactive"
    assert "www-authenticate" not in resp.headers


async def test_rbac_superuser_keeps_access(client, db_session, auth_headers):
    assert (await client.get(ADMIN_LIST, headers=auth_headers)).status_code == 200

    # passa pela autenticação e chega na validação do payload (422), não 401/403
    resp = await client.post(
        ADMIN_READ, json={"message_ids": []}, headers=auth_headers
    )
    assert resp.status_code == 422
