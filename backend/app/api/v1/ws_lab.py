"""WebSocket endpoint driving one lab session (mini-SOC simulation).

Protocol (JSON messages, ``type`` discriminator):

client -> server
    start     {scenario, speed?}   begin replaying a scenario
    pause     {}                   freeze the simulated timeline
    resume    {}                   continue where it stopped
    restart   {scenario?, speed?}  reset and replay from the beginning
    speed     {value}              1-4 (UI offers 1x/2x/4x)
    reload_rules {}                hot-reload rules from disk
    pong       {}                  heartbeat reply

server -> client
    connected {session_id, status, speed, speed_options, rules}
    started   {scenario, total_events, speed}
    event     {event}
    alert     {alert}
    incident  {incident}
    state     {status, speed}
    rules     {rules, errors}
    completed {report}
    error     {code, message?}
    ping      {}

Limits: per-IP and global connection caps, ticket auth, 30 minute session
deadline (also bounded by the ticket expiry), 50 ms pacing granularity so
pause/speed changes react immediately, and a bounded inbound message size.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import defaultdict
from contextlib import suppress
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.collectors.scenario_generator import get_scenario
from app.database.session import async_session_maker
from app.detection.engine import DetectionEngine, default_rules_dir
from app.services.lab_service import LabService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["lab"])

MAX_CONNECTIONS_PER_IP = 3
MAX_ACTIVE_SESSIONS = 20
PING_INTERVAL_SECONDS = 30.0
SESSION_MAX_SECONDS = 30 * 60
SPEED_OPTIONS = (1, 2, 4)
DEFAULT_SPEED = 2
MIN_SPEED = 1
MAX_SPEED = 4
CHUNK_SECONDS = 0.05
MAX_MESSAGE_BYTES = 4096

_active_connections: dict[str, int] = defaultdict(int)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _active_total() -> int:
    return sum(_active_connections.values())


class _SessionExpired(Exception):
    """Raised inside the runner when the session deadline passes."""


class LabSessionRunner:
    """State machine + playback task for a single lab WebSocket session."""

    def __init__(self, websocket: WebSocket, session_id: str, ticket_deadline: float) -> None:
        self.websocket = websocket
        self.session_id = session_id
        self.status = "idle"  # idle | running | paused | completed
        self.speed = DEFAULT_SPEED
        self.engine: DetectionEngine | None = None
        self.scenario = None
        self.task: asyncio.Task | None = None
        self.deadline = time.monotonic() + min(SESSION_MAX_SECONDS, ticket_deadline)

    # -- outbound ------------------------------------------------------------

    async def send(self, payload: dict[str, Any]) -> None:
        await self.websocket.send_json(payload)

    async def send_error(self, code: str, message: str = "") -> None:
        with suppress(Exception):
            await self.send({"type": "error", "code": code, "message": message})

    async def send_state(self) -> None:
        await self.send(
            {"type": "state", "status": self.status, "speed": self.speed}
        )

    async def send_connected(self) -> None:
        await self.send(
            {
                "type": "connected",
                "session_id": self.session_id,
                "status": self.status,
                "speed": self.speed,
                "speed_options": list(SPEED_OPTIONS),
                "rules": [rule.model_dump() for rule in LabService.list_rules()],
                "server_time": _now_iso(),
            }
        )

    # -- inbound -------------------------------------------------------------

    async def handle(self, data: dict[str, Any]) -> None:
        message_type = data.get("type")
        if message_type == "pong":
            return
        if message_type == "start":
            await self._start(data, restart=False)
        elif message_type == "restart":
            await self._start(data, restart=True)
        elif message_type == "pause":
            if self.status == "running":
                self.status = "paused"
                await self.send_state()
            else:
                await self.send_error("NOT_RUNNING", f"status is {self.status}")
        elif message_type == "resume":
            if self.status == "paused":
                self.status = "running"
                await self.send_state()
            else:
                await self.send_error("NOT_PAUSED", f"status is {self.status}")
        elif message_type == "speed":
            self._set_speed(data.get("value"))
            await self.send_state()
        elif message_type == "reload_rules":
            await self._reload_rules()
        else:
            await self.send_error("BAD_MESSAGE", str(message_type))

    def _set_speed(self, raw: Any) -> None:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return
        self.speed = max(MIN_SPEED, min(MAX_SPEED, value))

    async def _reload_rules(self) -> None:
        errors: list[str] = []
        if self.engine is not None:
            try:
                self.engine.reload_if_changed()
                errors = list(self.engine.stats.get("reload_errors", []))
            except Exception:
                logger.warning("Session rule reload failed", exc_info=True)
                errors = ["reload failed"]
        else:
            LabService.list_rules()  # triggers a catalog reload
        await self.send(
            {
                "type": "rules",
                "rules": [rule.model_dump() for rule in LabService.list_rules()],
                "errors": errors,
            }
        )

    async def _start(self, data: dict[str, Any], *, restart: bool) -> None:
        if self.status in ("running", "paused") and not restart:
            await self.send_error("ALREADY_STARTED", "session already running")
            return

        scenario_id = data.get("scenario") or (self.scenario.id if self.scenario else None)
        scenario = get_scenario(str(scenario_id)) if scenario_id else None
        if scenario is None:
            await self.send_error("UNKNOWN_SCENARIO", str(scenario_id))
            return

        await self.stop_task()
        if "speed" in data:
            self._set_speed(data.get("speed"))
        self.scenario = scenario
        self.engine = DetectionEngine(default_rules_dir(), scenario=scenario)
        self.status = "running"
        self.deadline = time.monotonic() + SESSION_MAX_SECONDS

        await self.send(
            {
                "type": "started",
                "scenario": {
                    "id": scenario.id,
                    "name": scenario.name,
                    "description": scenario.description,
                    "event_count": scenario.event_count,
                    "expected_rules": list(scenario.expected_rules),
                    "expected_severity": scenario.expected_severity,
                    "mitre": list(scenario.mitre),
                },
                "total_events": scenario.event_count,
                "speed": self.speed,
                "status": self.status,
            }
        )
        self.task = asyncio.create_task(self._play())

    async def stop_task(self) -> None:
        if self.task is not None:
            self.task.cancel()
            with suppress(asyncio.CancelledError):
                await self.task
            self.task = None

    # -- playback ------------------------------------------------------------

    async def _play(self) -> None:
        try:
            scenario = self.scenario
            assert scenario is not None and self.engine is not None
            for index, step in enumerate(scenario.iter_steps(), start=1):
                await self._wait_while_paused()
                await self._paced_sleep(step.delay_seconds)
                result = self.engine.process(step.record, f"evt-{index}")
                await self.send({"type": "event", "event": result.event})
                for alert in result.alerts:
                    await self.send({"type": "alert", "alert": alert.to_dict()})
                if result.incident is not None:
                    await self.send({"type": "incident", "incident": result.incident})

            report = self.engine.complete()
            self.status = "completed"
            await self.send({"type": "completed", "report": report})
            await self.send_state()
        except _SessionExpired:
            self.status = "idle"
            await self.send_error("SESSION_EXPIRED", "session deadline reached")
            with suppress(Exception):
                await self.websocket.close(code=1008, reason="Session expired")
        except asyncio.CancelledError:
            raise
        except WebSocketDisconnect:
            self.status = "idle"
        except Exception:
            logger.error("Lab playback failed", exc_info=True)
            self.status = "idle"
            await self.send_error("RUNTIME_ERROR", "playback failed")

    async def _wait_while_paused(self) -> None:
        while self.status == "paused":
            self._check_expiry()
            await asyncio.sleep(CHUNK_SECONDS)

    async def _paced_sleep(self, delay_1x: float) -> None:
        """Sleep ``delay_1x`` seconds of wall-clock time at 1x, in chunks.

        Chunking lets pause, speed changes and the session deadline take
        effect within ``CHUNK_SECONDS`` even during a long step gap.
        """
        remaining = delay_1x
        while remaining > 0:
            while self.status == "paused":
                self._check_expiry()
                await asyncio.sleep(CHUNK_SECONDS)
            self._check_expiry()
            wall = min(CHUNK_SECONDS, remaining / self.speed)
            await asyncio.sleep(wall)
            remaining -= wall * self.speed

    def _check_expiry(self) -> None:
        if time.monotonic() > self.deadline:
            raise _SessionExpired()

    async def shutdown(self) -> None:
        self.status = "idle"
        await self.stop_task()


async def _heartbeat(websocket: WebSocket) -> None:
    while True:
        await asyncio.sleep(PING_INTERVAL_SECONDS)
        try:
            await websocket.send_json({"type": "ping"})
        except Exception:
            return


@router.websocket("/ws/lab/{session_id}")
async def websocket_lab(
    websocket: WebSocket,
    session_id: str,
    ticket: str = Query(...),
):
    """Ephemeral lab session (short-lived ticket auth, limited connections)."""
    client_ip = websocket.client.host if websocket.client else "unknown"

    if len(session_id) > 64 or not session_id.isascii():
        await websocket.close(code=1008, reason="Invalid session id")
        return
    if _active_connections[client_ip] >= MAX_CONNECTIONS_PER_IP:
        await websocket.close(code=1013, reason="Too many connections")
        return
    if _active_total() >= MAX_ACTIVE_SESSIONS:
        await websocket.close(code=1013, reason="Server busy")
        return

    async with async_session_maker() as db:
        session = await LabService.get_session(db=db, ticket=ticket)

    if not session:
        await websocket.close(code=1008, reason="Invalid or expired ticket")
        return

    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    ticket_seconds_left = max(0.0, (expires_at - datetime.now(timezone.utc)).total_seconds())
    if ticket_seconds_left <= 0:
        await websocket.close(code=1008, reason="Expired ticket")
        return

    _active_connections[client_ip] += 1
    await websocket.accept()

    runner = LabSessionRunner(websocket, session_id, ticket_seconds_left)
    heartbeat_task = asyncio.create_task(_heartbeat(websocket))

    try:
        await runner.send_connected()
        while True:
            raw = await websocket.receive_text()
            if len(raw.encode("utf-8", "ignore")) > MAX_MESSAGE_BYTES:
                await runner.send_error("BAD_MESSAGE", "message too large")
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await runner.send_error("BAD_MESSAGE", "invalid JSON")
                continue
            if not isinstance(data, dict):
                await runner.send_error("BAD_MESSAGE", "expected a JSON object")
                continue
            await runner.handle(data)
    except WebSocketDisconnect:
        logger.info("Lab WS disconnected session=%s ip=%s", session_id, client_ip)
    except Exception:
        logger.error("Lab WS error", exc_info=True)
        with suppress(Exception):
            await websocket.close(code=1011, reason="Internal error")
    finally:
        heartbeat_task.cancel()
        await runner.shutdown()
        _active_connections[client_ip] -= 1
        if _active_connections[client_ip] <= 0:
            del _active_connections[client_ip]
