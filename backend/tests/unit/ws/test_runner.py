"""Estados do LabSessionRunner sem socket real (FakeWebSocket)."""

from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

import pytest
from starlette.websockets import WebSocketDisconnect

import app.api.v1.ws_lab as ws_lab
from app.api.v1.ws_lab import LabSessionRunner, _SessionExpired


class FakeWebSocket:
    """Socket falso: grava payloads e pode falhar a partir do N-envio."""

    def __init__(self, *, fail_from: int | None = None, failure: Exception | None = None) -> None:
        self.sent: list[dict] = []
        self.closed: tuple[int | None, str | None] | None = None
        self._fail_from = fail_from
        self._failure = failure or RuntimeError("socket morto")

    async def send_json(self, payload: dict) -> None:
        if self._fail_from is not None and len(self.sent) >= self._fail_from:
            raise self._failure
        self.sent.append(payload)

    async def close(self, code: int | None = None, reason: str | None = None) -> None:
        self.closed = (code, reason)


def _runner(ws: FakeWebSocket | None = None) -> tuple[LabSessionRunner, FakeWebSocket]:
    ws = ws or FakeWebSocket()
    return LabSessionRunner(ws, "sess-unit", ticket_deadline=1800.0), ws


def _types(ws: FakeWebSocket) -> list[str]:
    return [m.get("type") for m in ws.sent]


async def test_send_connected_includes_catalog_and_defaults():
    runner, ws = _runner()
    await runner.send_connected()

    payload = ws.sent[0]
    assert payload["type"] == "connected"
    assert payload["session_id"] == "sess-unit"
    assert payload["status"] == "idle"
    assert payload["speed"] == ws_lab.DEFAULT_SPEED
    assert payload["speed_options"] == list(ws_lab.SPEED_OPTIONS)
    assert len(payload["rules"]) >= 10
    assert all({"id", "title", "kind"} <= set(r) for r in payload["rules"])


async def test_handle_unknown_message_type_reports_bad_message():
    runner, ws = _runner()
    await runner.handle({"type": "whatever"})
    assert ws.sent == [{"type": "error", "code": "BAD_MESSAGE", "message": "whatever"}]


async def test_pong_is_ignored():
    runner, ws = _runner()
    await runner.handle({"type": "pong"})
    assert ws.sent == []


async def test_pause_without_running_and_resume_without_paused():
    runner, ws = _runner()
    await runner.handle({"type": "pause"})
    await runner.handle({"type": "resume"})
    codes = [m["code"] for m in ws.sent]
    assert codes == ["NOT_RUNNING", "NOT_PAUSED"]


async def test_start_then_pause_resume_and_state_messages():
    runner, ws = _runner()
    await runner.handle({"type": "start", "scenario": "temp-process", "speed": 4})
    assert "started" in _types(ws)
    assert runner.status == "running"

    await runner.handle({"type": "pause"})
    assert runner.status == "paused"
    assert ws.sent[-1] == {"type": "state", "status": "paused", "speed": 4}

    await runner.handle({"type": "resume"})
    assert runner.status == "running"

    await runner.handle({"type": "speed", "value": 1})
    assert runner.speed == 1

    await runner.stop_task()
    assert runner.task is None


async def test_start_twice_is_rejected_and_unknown_scenario_too():
    runner, ws = _runner()
    await runner.handle({"type": "start", "scenario": "temp-process", "speed": 4})
    await runner.handle({"type": "start", "scenario": "temp-process"})
    assert ws.sent[1]["code"] == "ALREADY_STARTED"

    await runner.stop_task()

    fresh, ws2 = _runner()
    await fresh.handle({"type": "start", "scenario": "does-not-exist"})
    assert ws2.sent[0]["code"] == "UNKNOWN_SCENARIO"
    assert fresh.status == "idle"


async def test_set_speed_clamps_and_ignores_garbage():
    runner, _ = _runner()
    runner._set_speed(99)
    assert runner.speed == ws_lab.MAX_SPEED
    runner._set_speed(-5)
    assert runner.speed == ws_lab.MIN_SPEED
    runner._set_speed("banana")
    runner._set_speed(None)
    runner._set_speed(2.9)
    assert runner.speed == 2


async def test_reload_rules_without_engine_uses_catalog():
    runner, ws = _runner()
    await runner.handle({"type": "reload_rules"})
    assert ws.sent[0]["type"] == "rules"
    assert ws.sent[0]["errors"] == []
    assert len(ws.sent[0]["rules"]) >= 10


async def test_reload_rules_with_engine_reports_stats():
    runner, ws = _runner()
    await runner.handle({"type": "start", "scenario": "temp-process", "speed": 4})
    await runner.stop_task()

    await runner.handle({"type": "reload_rules"})
    assert ws.sent[-1]["type"] == "rules"
    assert isinstance(ws.sent[-1]["errors"], list)


async def test_play_completes_scenario_and_reports():
    """_play inteiro: eventos, alertas e relatório final (velocidade 4x)."""
    runner, ws = _runner()
    await runner.handle({"type": "start", "scenario": "temp-process", "speed": 4})
    await asyncio.wait_for(runner.task, timeout=30)

    types = _types(ws)
    assert types.count("event") == 4
    assert "alert" in types or "incident" in types
    assert types[-2:] == ["completed", "state"]
    assert runner.status == "completed"
    report = next(m for m in ws.sent if m["type"] == "completed")["report"]
    assert isinstance(report, dict) and report


async def test_play_reports_runtime_error():
    runner, ws = _runner()

    def _explode():
        raise AssertionError("steps boom")

    runner.scenario = SimpleNamespace(iter_steps=_explode)
    runner.engine = object()
    runner.status = "running"
    await runner._play()

    assert ws.sent[0]["code"] == "RUNTIME_ERROR"
    assert runner.status == "idle"


async def test_play_handles_socket_disconnect():
    ws = FakeWebSocket(fail_from=1, failure=WebSocketDisconnect())
    runner = LabSessionRunner(ws, "sess-x", ticket_deadline=1800.0)
    await runner.handle({"type": "start", "scenario": "temp-process", "speed": 4})
    await asyncio.wait_for(runner.task, timeout=30)
    assert runner.status == "idle"


async def test_play_expires_and_closes_with_1008(monkeypatch):
    monkeypatch.setattr(ws_lab, "SESSION_MAX_SECONDS", -1)
    runner, ws = _runner()
    await runner.handle({"type": "start", "scenario": "temp-process", "speed": 4})
    await asyncio.wait_for(runner.task, timeout=30)

    errors = [m for m in ws.sent if m.get("type") == "error"]
    assert errors and errors[0]["code"] == "SESSION_EXPIRED"
    assert ws.closed == (1008, "Session expired")
    assert runner.status == "idle"


async def test_check_expiry_raises_session_expired():
    runner, _ = _runner()
    runner.deadline = time.monotonic() - 1
    with pytest.raises(_SessionExpired):
        runner._check_expiry()


async def test_send_error_swallows_closed_socket():
    ws = FakeWebSocket(fail_from=0)
    runner = LabSessionRunner(ws, "sess-x", ticket_deadline=1800.0)
    await runner.send_error("X", "y")  # não pode levantar
    assert ws.sent == []


async def test_send_state_and_shutdown_cancels_task():
    runner, ws = _runner()
    await runner.handle({"type": "start", "scenario": "temp-process", "speed": 4})
    assert runner.task is not None and not runner.task.done()

    await runner.shutdown()
    assert runner.status == "idle"
    assert runner.task is None
