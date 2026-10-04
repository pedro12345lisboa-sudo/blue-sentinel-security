"""Endpoint WebSocket /ws/lab: ticket, limites de conexão e framing de mensagens."""

from __future__ import annotations

import pytest
from starlette.websockets import WebSocketDisconnect

import app.api.v1.ws_lab as ws_lab
from tests.factories import create_lab_session


async def _session(db_session, **kwargs) -> tuple[str, str]:
    """Cria uma sessão no banco e devolve (session_id, ticket)."""
    row = await create_lab_session(db_session, **kwargs)
    return f"sess-{row.id}", row.session_token


async def test_connect_reports_connected_with_catalog(ws_client, db_session):
    session_id, ticket = await _session(db_session)

    with ws_client.websocket_connect(
        f"/api/v1/ws/lab/{session_id}?ticket={ticket}"
    ) as ws:
        payload = ws.receive_json()
        assert payload["type"] == "connected"
        assert payload["session_id"] == session_id
        assert len(payload["rules"]) >= 10

        ws.send_json({"type": "start", "scenario": "temp-process", "speed": 4})
        started = ws.receive_json()
        assert started["type"] == "started"
        assert started["total_events"] == 4

    assert dict(ws_lab._active_connections) == {}, "conexão deve sair do contador"


async def test_full_scenario_reaches_completed(ws_client, db_session):
    session_id, ticket = await _session(db_session)

    with ws_client.websocket_connect(
        f"/api/v1/ws/lab/{session_id}?ticket={ticket}"
    ) as ws:
        assert ws.receive_json()["type"] == "connected"
        ws.send_json({"type": "start", "scenario": "sqli-web", "speed": 4})

        types: list[str] = []
        for _ in range(60):
            payload = ws.receive_json()
            types.append(payload["type"])
            if payload["type"] == "completed":
                break
        assert types[0] == "started"
        assert types.count("event") == 5
        assert "completed" in types
        report = payload["report"]
        assert isinstance(report, dict)


@pytest.mark.parametrize(
    "session_id,code",
    [
        ("sess-without-ticket", 1008),  # ticket ausente => conexão rejeitada
    ],
)
async def test_missing_ticket_is_rejected(ws_client, session_id, code):
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with ws_client.websocket_connect(f"/api/v1/ws/lab/{session_id}") as ws:
            ws.receive_text()
    assert excinfo.value.code == code


async def test_invalid_ticket_closes_1008(ws_client):
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with ws_client.websocket_connect(
            "/api/v1/ws/lab/sess-x?ticket=tk-invalido"
        ) as ws:
            ws.receive_text()
    assert excinfo.value.code == 1008
    assert "ticket" in excinfo.value.reason.lower()


async def test_non_ascii_session_id_closes_1008(ws_client, db_session):
    _, ticket = await _session(db_session)
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with ws_client.websocket_connect(
            f"/api/v1/ws/lab/sessão-inválida?ticket={ticket}"
        ) as ws:
            ws.receive_text()
    assert excinfo.value.code == 1008


async def test_too_long_session_id_closes_1008(ws_client, db_session):
    _, ticket = await _session(db_session)
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with ws_client.websocket_connect(
            f"/api/v1/ws/lab/{'a' * 65}?ticket={ticket}"
        ) as ws:
            ws.receive_text()
    assert excinfo.value.code == 1008


async def test_per_ip_connection_cap_closes_1013(ws_client, db_session, monkeypatch):
    monkeypatch.setattr(ws_lab, "MAX_CONNECTIONS_PER_IP", 0)
    session_id, ticket = await _session(db_session)

    with pytest.raises(WebSocketDisconnect) as excinfo:
        with ws_client.websocket_connect(
            f"/api/v1/ws/lab/{session_id}?ticket={ticket}"
        ) as ws:
            ws.receive_text()
    assert excinfo.value.code == 1013


async def test_global_connection_cap_closes_1013(ws_client, db_session, monkeypatch):
    monkeypatch.setattr(ws_lab, "MAX_ACTIVE_SESSIONS", 0)
    session_id, ticket = await _session(db_session)

    with pytest.raises(WebSocketDisconnect) as excinfo:
        with ws_client.websocket_connect(
            f"/api/v1/ws/lab/{session_id}?ticket={ticket}"
        ) as ws:
            ws.receive_text()
    assert excinfo.value.code == 1013


async def test_message_framing_errors_do_not_close_socket(ws_client, db_session):
    session_id, ticket = await _session(db_session)

    with ws_client.websocket_connect(
        f"/api/v1/ws/lab/{session_id}?ticket={ticket}"
    ) as ws:
        assert ws.receive_json()["type"] == "connected"

        ws.send_text("{" + "x" * 5000)  # > 4096 bytes
        assert (ws.receive_json())["code"] == "BAD_MESSAGE"

        ws.send_text("nao é json")
        payload = ws.receive_json()
        assert payload["code"] == "BAD_MESSAGE"
        assert "invalid JSON" in payload["message"]

        ws.send_text("[1, 2, 3]")
        payload = ws.receive_json()
        assert payload["code"] == "BAD_MESSAGE"
        assert "JSON object" in payload["message"]

        ws.send_json({"type": "pause"})
        assert (ws.receive_json())["code"] == "NOT_RUNNING"

        ws.send_json({"type": "start", "scenario": "inexistente"})
        assert (ws.receive_json())["code"] == "UNKNOWN_SCENARIO"

        ws.send_json({"type": "pong"})  # não gera resposta
        ws.send_json({"type": "reload_rules"})
        assert (ws.receive_json())["type"] == "rules"

        ws.send_json({"type": "speed", "value": "junk"})
        assert (ws.receive_json())["type"] == "state"


async def test_internal_error_closes_with_1011(ws_client, db_session, monkeypatch):
    async def _boom(self):
        raise RuntimeError("falha interna")

    monkeypatch.setattr(ws_lab.LabSessionRunner, "send_connected", _boom)
    session_id, ticket = await _session(db_session)

    with pytest.raises(WebSocketDisconnect) as excinfo:
        with ws_client.websocket_connect(
            f"/api/v1/ws/lab/{session_id}?ticket={ticket}"
        ) as ws:
            ws.receive_text()
    assert excinfo.value.code == 1011
    assert dict(ws_lab._active_connections) == {}
