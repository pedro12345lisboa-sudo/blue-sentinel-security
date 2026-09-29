import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.lab_session import LabSession
from app.schemas.lab import LabSessionResponse, LabScenario

logger = logging.getLogger(__name__)

SESSION_TTL_MINUTES = 30

SCENARIOS = [
    LabScenario(
        id="suspicious-powershell",
        name="PowerShell EncodedCommand",
        description="Detecta execução de PowerShell com comando codificado em base64 (T1059.001).",
        severity="high",
    ),
    LabScenario(
        id="suspicious-network",
        name="Conexão de Rede Suspeita",
        description="Detecta conexão de saída para IP/porta incomuns (T1071.001).",
        severity="medium",
    ),
    LabScenario(
        id="ingress-tool-transfer",
        name="Transferência de Ferramenta",
        description="Detecta download de ferramentas ofensivas (T1105).",
        severity="high",
    ),
    LabScenario(
        id="registry-persistence",
        name="Persistência via Registro",
        description="Detecta escrita em Run key do registro (T1547.001).",
        severity="critical",
    ),
]


class LabService:
    """Lab session lifecycle and scenario listing."""

    @staticmethod
    async def create_session(
        db: AsyncSession,
        ip_address: str,
    ) -> LabSessionResponse:
        session_id = f"sess-{uuid.uuid4().hex[:12]}"
        ticket = f"tk-{uuid.uuid4().hex[:16]}"
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=SESSION_TTL_MINUTES
        )

        row = LabSession(
            session_token=ticket,
            ip_address=ip_address,
            status="active",
            expires_at=expires_at,
        )
        db.add(row)
        await db.commit()

        logger.info("Lab session created id=%s ip=%s", session_id, ip_address)
        return LabSessionResponse(
            session_id=session_id,
            ticket=ticket,
            expires_at=expires_at,
        )

    @staticmethod
    async def get_session(
        db: AsyncSession,
        ticket: str,
    ) -> LabSession | None:
        result = await db.execute(
            select(LabSession).where(
                LabSession.session_token == ticket,
                LabSession.status == "active",
                LabSession.expires_at > datetime.now(timezone.utc),
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    def list_scenarios() -> list[LabScenario]:
        return SCENARIOS
