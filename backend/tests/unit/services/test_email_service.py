"""EmailService: console sem SMTP, envio com SMTP configurado e falhas."""

from __future__ import annotations

import sys
import types

import pytest

from app.core.config import settings
from app.services.email_service import EmailService


@pytest.fixture
def smtp_configured(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.test")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_user", "user")
    monkeypatch.setattr(settings, "smtp_password", "secret")
    monkeypatch.setattr(settings, "smtp_from", "noreply@example.test")
    monkeypatch.setattr(settings, "email_to", "owner@example.test")


async def test_without_smtp_logs_instead_of_sending(caplog):
    with caplog.at_level("INFO", logger="app.services.email_service"):
        result = await EmailService.send_contact_notification(
            name="Ana", email="ana@example.com", subject="oi", message="corpo"
        )
    assert result is True
    assert "SMTP not configured" in caplog.text


async def test_with_smtp_sends_via_aiosmtplib(smtp_configured, monkeypatch):
    captured: dict = {}

    fake = types.ModuleType("aiosmtplib")

    async def _send(message, **kwargs):
        captured.update(kwargs)
        captured["subject"] = message["Subject"]
        captured["body"] = message.get_payload()

    fake.send = _send  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "aiosmtplib", fake)

    result = await EmailService.send_contact_notification(
        name="Ana", email="ana@example.com", subject="Orçamento", message="corpo da mensagem"
    )

    assert result is True
    assert captured["hostname"] == "smtp.example.test"
    assert captured["port"] == 587
    assert captured["use_tls"] is True
    assert captured["subject"] == "[Blue-Sentinel] Orçamento"
    assert "ana@example.com" in captured["body"]


async def test_send_failure_returns_false(smtp_configured, monkeypatch):
    fake = types.ModuleType("aiosmtplib")

    async def _send(*_args, **_kwargs):
        raise ConnectionError("smtp caiu")

    fake.send = _send  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "aiosmtplib", fake)

    result = await EmailService.send_contact_notification(
        name="Ana", email="ana@example.com", subject="oi", message="corpo"
    )
    assert result is False


async def test_missing_aiosmtplib_returns_false(smtp_configured, monkeypatch):
    monkeypatch.delitem(sys.modules, "aiosmtplib", raising=False)

    result = await EmailService.send_contact_notification(
        name="Ana", email="ana@example.com", subject="oi", message="corpo"
    )
    assert result is False
