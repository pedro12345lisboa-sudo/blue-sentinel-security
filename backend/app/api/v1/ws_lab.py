import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.database.session import async_session_maker
from app.services.lab_service import LabService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["lab"])

# Connection tracking: ip -> active connections
_active_connections: dict[str, int] = defaultdict(int)
MAX_CONNECTIONS_PER_IP = 3
PING_INTERVAL = 30.0


@router.websocket("/ws/lab/{session_id}")
async def websocket_lab(
    websocket: WebSocket,
    session_id: str,
    ticket: str = Query(...),
):
    """WebSocket endpoint for lab events.

    Uses a short-lived ticket for authentication.
    Limits connections per IP, supports ping/pong, clean shutdown.
    """
    client_ip = websocket.client.host if websocket.client else "unknown"

    # Rate limit: max connections per IP
    if _active_connections[client_ip] >= MAX_CONNECTIONS_PER_IP:
        await websocket.close(code=1013, reason="Too many connections")
        return

    # Validate session + ticket
    async with async_session_maker() as db:
        session = await LabService.get_session(session_token=ticket, db=db)

    if not session:
        await websocket.close(code=1008, reason="Invalid or expired ticket")
        return

    _active_connections[client_ip] += 1
    await websocket.accept()

    try:
        await websocket.send_json({
            "type": "connected",
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        async def heartbeat():
            """Send ping periodically, detect dead connections."""
            while True:
                await asyncio.sleep(PING_INTERVAL)
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break

        heartbeat_task = asyncio.create_task(heartbeat())

        try:
            while True:
                # Listen for client messages (pong, commands)
                data = await websocket.receive_json()
                msg_type = data.get("type", "")

                if msg_type == "pong":
                    continue

                # In a later stage: evaluate detection rules on commands
                await websocket.send_json({
                    "type": "ack",
                    "echo": msg_type,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

        except WebSocketDisconnect:
            logger.info("Lab WS disconnected", session_id=session_id, ip=client_ip)
        finally:
            heartbeat_task.cancel()

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.error("Lab WS error", exc_info=True)
        try:
            await websocket.close(code=1011, reason="Internal error")
        except Exception:
            pass
    finally:
        _active_connections[client_ip] -= 1
        if _active_connections[client_ip] <= 0:
            del _active_connections[client_ip]
