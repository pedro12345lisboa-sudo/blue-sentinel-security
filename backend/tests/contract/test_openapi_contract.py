"""Contrato OpenAPI (schemathesis): cada operação gera dados reais e passa os checks.

Regras:
* rede bloqueada (GitHub offline) — o contrato nunca depende da internet;
* o banco é recriado por teste (fixtures síncronas, pois o schemathesis roda síncrono);
* operações de contrato (`contact`, `lab/sessions`) são executadas em loop até
  expor também o 429 declarado.
"""

from __future__ import annotations

import asyncio

import pytest
from schemathesis.openapi.loaders import from_asgi

from app.core.errors import BlueSentinelError
from app.services.github_service import GitHubService
from main import app
from app.database.session import Base, engine

schema = from_asgi("/openapi.json", app)

OPERATIONS = [
    result.ok()
    for result in schema.get_all_operations()
    if hasattr(result, "ok")
]

EXPECTED_PATHS = {
    "/",
    "/api/v1/contact",
    "/api/v1/github/stats",
    "/api/v1/lab/sessions",
    "/api/v1/lab/scenarios",
    "/api/v1/lab/rules",
    "/api/v1/lab/rules/{rule_id}",
    "/api/v1/status",
    "/api/v1/health/live",
    "/api/v1/health/ready",
    "/api/v1/auth/login",
    "/api/v1/admin/messages",
    "/api/v1/admin/messages/read",
}

VALID_CONTACT_BODY = {
    "name": "Contrato Teste",
    "email": "contrato@example.com",
    "subject": "Assunto",
    "message": "Mensagem de teste suficientemente longa para o contrato.",
}


def _reset_database() -> None:
    async def _run() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()

    asyncio.run(_run())


@pytest.fixture(autouse=True)
def _database():
    _reset_database()
    yield
    _reset_database()


@pytest.fixture(autouse=True)
def _offline_github():
    """Nenhum teste de contrato pode tocar a rede."""
    original = GitHubService._fetch_from_api

    async def _offline(self):
        raise BlueSentinelError(
            "offline", code="GITHUB_UNREACHABLE", status_code=502
        )

    GitHubService._fetch_from_api = _offline
    yield
    GitHubService._fetch_from_api = original


def test_openapi_document_declares_every_public_route():
    document = app.openapi()
    assert EXPECTED_PATHS <= set(document["paths"])
    assert document["info"]["title"] == "Blue-Sentinel API"


def test_error_responses_declare_expected_media_types():
    document = app.openapi()
    contact = document["paths"]["/api/v1/contact"]["post"]["responses"]
    assert "429" in contact and "422" in contact
    assert "application/json" in contact["429"]["content"]

    admin = document["paths"]["/api/v1/admin/messages"]["get"]["responses"]
    assert {"400", "401", "403", "422"} <= set(admin)

    rule = document["paths"]["/api/v1/lab/rules/{rule_id}"]["get"]["responses"]
    assert "404" in rule
    assert "application/json" in rule["404"]["content"]


@pytest.mark.parametrize("operation", OPERATIONS, ids=lambda op: f"{op.method} {op.full_path}")
def test_operation_contract(operation):
    """Um caso gerado (ou mais, nos contratos com rate limit) passa todos os checks."""
    path = operation.full_path
    case = operation.as_strategy().example()

    if path.endswith("/api/v1/contact"):
        case.body = VALID_CONTACT_BODY
        codes = set()
        for _ in range(12):
            response = case.call()
            case.validate_response(response)
            codes.add(response.status_code)
        assert codes == {202, 429}, f"esperava 202 e 429, veio {codes}"
        return

    if path.endswith("/api/v1/lab/sessions"):
        codes = set()
        for _ in range(12):
            response = case.call()
            case.validate_response(response)
            codes.add(response.status_code)
        assert codes == {201, 429}, f"esperava 201 e 429, veio {codes}"
        return

    response = case.call()
    case.validate_response(response)
