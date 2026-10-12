"""Webhook do Alertmanager: token obrigatório + repasse com dedup."""

from __future__ import annotations

import pytest

from app.core.config import settings


class FakeNotifier:
    def __init__(self) -> None:
        self.received: list = []

    async def notify(self, alert) -> bool:
        self.received.append(alert)
        return True


ALERTMANAGER_PAYLOAD = {
    "alerts": [
        {
            "labels": {"alertname": "BackendDown", "severity": "critical"},
            "annotations": {
                "summary": "Backend fora do ar",
                "runbook_url": "https://rb.local/runbook.md#backend-down",
            },
            "status": "firing",
        }
    ]
}


async def test_webhook_is_closed_without_token(client):
    response = await client.post("/api/v1/alerts/webhook", json=ALERTMANAGER_PAYLOAD)
    assert response.status_code == 403
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["status"] == 403
    assert body["code"] == "FORBIDDEN"


async def test_webhook_rejects_wrong_token(client, monkeypatch):
    monkeypatch.setattr(settings, "alert_webhook_token", "token-certo")
    response = await client.post(
        "/api/v1/alerts/webhook",
        json=ALERTMANAGER_PAYLOAD,
        headers={"Authorization": "Bearer token-errado"},
    )
    assert response.status_code == 403


async def test_webhook_forwards_parsed_alerts(client, monkeypatch):
    monkeypatch.setattr(settings, "alert_webhook_token", "token-certo")
    fake = FakeNotifier()
    monkeypatch.setattr("app.api.v1.alerts.notifier", fake)

    response = await client.post(
        "/api/v1/alerts/webhook",
        json=ALERTMANAGER_PAYLOAD,
        headers={"Authorization": "Bearer token-certo"},
    )
    assert response.status_code == 200
    assert response.json() == {"accepted": 1, "forwarded": 1}
    assert [alert.name for alert in fake.received] == ["BackendDown"]
    assert fake.received[0].runbook_url.endswith("#backend-down")


async def test_webhook_accepts_x_alert_token_header(client, monkeypatch):
    monkeypatch.setattr(settings, "alert_webhook_token", "token-certo")
    fake = FakeNotifier()
    monkeypatch.setattr("app.api.v1.alerts.notifier", fake)
    response = await client.post(
        "/api/v1/alerts/webhook",
        json={"alerts": []},
        headers={"X-Alert-Token": "token-certo"},
    )
    assert response.status_code == 200
    assert response.json() == {"accepted": 0, "forwarded": 0}


async def test_webhook_rejects_invalid_json(client, monkeypatch):
    monkeypatch.setattr(settings, "alert_webhook_token", "token-certo")
    response = await client.post(
        "/api/v1/alerts/webhook",
        content=b"\x00\x01nada-json",
        headers={
            "Authorization": "Bearer token-certo",
            "Content-Type": "application/json",
        },
    )
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_PAYLOAD"
