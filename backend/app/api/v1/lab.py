"""REST endpoints for the interactive detection lab."""

import logging

from fastapi import APIRouter, Depends, Request

from app.core.deps import get_db_session
from app.schemas.lab import LabRuleDetail, LabRuleSummary, LabScenario, LabSessionResponse
from app.services.lab_service import LabService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lab", tags=["lab"])


@router.post("/sessions", response_model=LabSessionResponse, status_code=201)
async def create_lab_session(
    request: Request,
    db=Depends(get_db_session),
) -> LabSessionResponse:
    """Create a new ephemeral lab session (rate-limited per IP)."""
    client_ip = request.client.host if request.client else "unknown"
    return await LabService.create_session(ip_address=client_ip, db=db)


@router.get("/scenarios", response_model=list[LabScenario])
async def list_scenarios() -> list[LabScenario]:
    """List the synthetic detection scenarios (defensive-only content)."""
    return LabService.list_scenarios()


@router.get("/rules", response_model=list[LabRuleSummary])
async def list_rules() -> list[LabRuleSummary]:
    """Sigma/YARA/correlation rule catalog."""
    return LabService.list_rules()


@router.get("/rules/{rule_id}", response_model=LabRuleDetail)
async def get_rule(rule_id: str) -> LabRuleDetail:
    """Full rule document for the educational explanation panel."""
    return LabService.get_rule(rule_id)
