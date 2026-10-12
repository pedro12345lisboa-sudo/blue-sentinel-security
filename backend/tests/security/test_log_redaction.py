"""Redação de logs: nenhum e-mail completo, senha ou token sai do backend.

Contrato (docs/security/data-inventory.md): cada linha de log é JSON e o
:class:`RedactionFilter` mascara o dado *antes* da escrita — o teste varre a
saída real do pipeline (handler InterceptHandler) em vez de confiar apenas na
unidade isolada da função de redação.
"""

from __future__ import annotations

import json
import logging
import re

import pytest

from app.core.logging import (
    REDACTED,
    RedactionFilter,
    mask_email,
    redact_text,
    request_id_var,
    setup_logging,
)
from tests.factories import contact_payload

FULL_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]{2,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b")

SECRET_VALUES = ("Sup3rSecret!Passw0rd", "eyJhbGciOiJIUzI1NiJ9.aaa.bbb")


def parse_log_lines(stderr: str) -> list[dict]:
    records = []
    for line in stderr.splitlines():
        if not line.startswith("{"):
            continue
        records.append(json.loads(line))
    return records


@pytest.fixture
def json_logging(capsys):
    """Instala o pipeline real de logging e restaura o root logger no fim."""
    root = logging.getLogger()
    saved_handlers = root.handlers[:]
    saved_level = root.level
    saved_filters = root.filters[:]
    setup_logging()
    yield capsys
    capsys.readouterr()  # descarta o restante para não vazar em outros testes
    root.handlers = saved_handlers
    root.setLevel(saved_level)
    root.filters[:] = saved_filters


# --------------------------------------------------------------------------- #
# Unidade da redação                                                          #
# --------------------------------------------------------------------------- #


def test_mask_email_hides_local_part():
    assert mask_email("joao.silva@example.com") == "j***@example.com"
    assert mask_email("a@b.co") == "a***@b.co"
    assert mask_email("sem-dominio") == REDACTED


def test_redact_text_masks_email_jwt_bearer_and_assignments():
    masked = redact_text(
        "user=maria.tester@example.com token=abc123def456 "
        "authorization: Bearer eyJaaaaaaaa.bbbbbbbb.cccccccc "
        "jwt=eyJxxxxxxxx.yyyyyyyy.zzzzzzzz"
    )
    assert "maria.tester@example.com" not in masked
    assert "m***@example.com" in masked
    assert "token=" + REDACTED in masked
    assert JWT_RE.search(masked) is None
    assert "abc123def456" not in masked
    assert REDACTED in masked
    # Bearer avulso (sem par authorization=) também é redigido.
    bearer_only = redact_text("chave enviada como Bearer abcdef1234567890")
    assert "abcdef1234567890" not in bearer_only
    assert "Bearer " + REDACTED in bearer_only


def test_redaction_filter_redacts_extra_fields():
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "ok", (), None)
    record.email = "cliente@example.com"
    record.password = "Sup3rSecret!Passw0rd"
    record.client_ip = "198.51.100.4"
    record.context = {"to": "x@example.com", "note": "ligação às 10"}
    RedactionFilter().filter(record)
    assert record.__dict__["email"] == REDACTED
    assert record.__dict__["password"] == REDACTED
    assert record.__dict__["client_ip"] == REDACTED
    assert "x@example.com" not in json.dumps(record.__dict__["context"])


# --------------------------------------------------------------------------- #
# Pipeline completo (handler JSON no stderr)                                  #
# --------------------------------------------------------------------------- #


def test_sensitive_extras_are_redacted_in_emitted_json(json_logging):
    log = logging.getLogger("test.pii.extras")
    log.info(
        "login recebido",
        extra={
            "email": "mary.secret@example.com",
            "password": "Sup3rSecret!Passw0rd",
            "authorization": "Bearer abcdef123456",
        },
    )
    records = parse_log_lines(json_logging.readouterr().err)
    payload = json.dumps(records)
    assert "mary.secret@example.com" not in payload
    assert "Sup3rSecret!Passw0rd" not in payload
    assert "abcdef123456" not in payload
    email_field = [r for r in records if r.get("logger") == "test.pii.extras"][0]
    assert email_field["email"] == REDACTED


def test_message_interpolation_is_redacted(json_logging):
    logging.getLogger("test.pii.msg").info(
        "contato de %s password=%s", "ana@example.com", "Sup3rSecret!Passw0rd"
    )
    record = parse_log_lines(json_logging.readouterr().err)[-1]
    assert "ana@example.com" not in record["message"]
    assert "Sup3rSecret!Passw0rd" not in record["message"]
    assert "a***@example.com" in record["message"]


def test_request_contextvar_injects_request_id(json_logging):
    token = request_id_var.set("ctxreq123456")
    try:
        logging.getLogger("test.pii.ctx").info("mensagem qualquer")
    finally:
        request_id_var.reset(token)
    record = parse_log_lines(json_logging.readouterr().err)[-1]
    assert record["request_id"] == "ctxreq123456"
    assert record["level"] == "INFO"
    assert record["logger"] == "test.pii.ctx"


async def test_request_log_line_has_structured_context(client, json_logging):
    response = await client.get("/api/v1/health/live")
    request_id = response.headers["X-Request-ID"]
    records = [
        r for r in parse_log_lines(json_logging.readouterr().err) if r["logger"] == "app.request"
    ]
    assert records, "middleware deve registrar a requisição em JSON"
    log_line = records[-1]
    assert log_line["request_id"] == request_id
    assert log_line["method"] == "GET"
    assert log_line["path"] == "/api/v1/health/live"
    assert log_line["route"] == "/api/v1/health/live"
    assert log_line["status"] == 200
    assert log_line["duration_ms"] >= 0
    # Nunca query string (pode carregar token) nem IP do cliente.
    assert "query" not in log_line
    assert "ip" not in log_line


async def test_contact_flow_never_logs_full_email(client, json_logging):
    payload = contact_payload(email="mary.secret@example.com")
    response = await client.post("/api/v1/contact", json=payload)
    assert response.status_code == 202
    stderr = json_logging.readouterr().err
    assert "mary.secret@example.com" not in stderr
    assert not FULL_EMAIL_RE.search(stderr), "nenhum e-mail completo pode aparecer nos logs"


async def test_no_sensitive_values_across_exercised_endpoints(client, json_logging):
    await client.post("/api/v1/contact", json=contact_payload())
    await client.get("/api/v1/status")
    await client.get("/api/v1/rota-inexistente")
    stderr = json_logging.readouterr().err
    for secret in SECRET_VALUES:
        assert secret not in stderr
    assert not FULL_EMAIL_RE.search(stderr)
    assert not JWT_RE.search(stderr)
    # Toda linha emitida pelo handler é JSON válido (coletável pelo Loki).
    for line in stderr.splitlines():
        if line.startswith("{"):
            json.loads(line)
