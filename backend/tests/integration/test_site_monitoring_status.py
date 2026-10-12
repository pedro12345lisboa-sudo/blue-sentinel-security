"""/api/v1/status: eventos de dogfooding sem dados pessoais + métricas."""

from __future__ import annotations

import json

import pytest

from app.monitoring import security_events as se

ATTACKER_IP = "198.51.100.23"


@pytest.fixture(autouse=True)
def _reset_security_events():
    se.reset()
    yield
    se.reset()


async def test_status_reports_site_monitoring_events_without_raw_ip(client):
    for _ in range(se.AUTH_BURST_THRESHOLD):
        se.observe(status=401, path="/api/v1/auth/login", ip=ATTACKER_IP)

    response = await client.get("/api/v1/status")
    assert response.status_code == 200
    body = response.json()

    monitoring = body["site_monitoring"]
    assert monitoring["window_seconds"] == 60
    assert monitoring["salt_rotation_hours"] == 24
    kinds = [event["kind"] for event in monitoring["events"]]
    assert "auth_burst" in kinds

    # O payload público nunca expõe o IP cru do atacante.
    assert ATTACKER_IP not in response.text
    assert "198.51.100" not in response.text

    event = monitoring["events"][0]
    assert event["actor"] == se.hash_ip(ATTACKER_IP)
    assert len(event["actor"]) == 16
    assert event["actor"] != ATTACKER_IP
    assert event["count"] >= se.AUTH_BURST_THRESHOLD
    assert set(event) == {
        "id",
        "timestamp",
        "kind",
        "severity",
        "count",
        "route",
        "actor",
        "detection",
    }


async def test_status_site_monitoring_empty_by_default(client):
    body = (await client.get("/api/v1/status")).json()
    assert body["site_monitoring"]["events"] == []


async def test_status_metrics_payload_matches_frontend_chart_shape(client):
    """O frontend lê data.metrics.{cpu,memory,disk,uptime} nos gráficos."""
    body = (await client.get("/api/v1/status")).json()
    metrics = body["metrics"]
    assert set(metrics) == {"cpu", "memory", "disk", "uptime"}
    assert set(metrics["memory"]) == {"used", "total", "percentage"}
    assert set(metrics["disk"]) == {"used", "total", "percentage"}
    assert 0 <= metrics["cpu"] <= 100
    assert 0 <= metrics["memory"]["percentage"] <= 100
    assert metrics["uptime"] >= 0


async def test_status_json_is_serializable_with_events(client):
    """Sanidade: o payload completo continua sendo JSON puro (sem objetos)."""
    se.observe(status=429, path="/api/v1/lab/sessions", ip=ATTACKER_IP)
    response = await client.get("/api/v1/status")
    json.loads(response.text)
