import logging
from typing import List

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.core.deps import get_db_session
from app.core.errors import BlueSentinelError
from app.schemas.lab import LabSessionResponse, LabScenario
from app.services.lab_service import LabService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lab", tags=["lab"])


@router.post("/sessions", response_model=LabSessionResponse, status_code=201)
async def create_lab_session(
    request: Request,
    db=Depends(get_db_session),
) -> LabSessionResponse:
    """Create a new lab session with short-lived ticket."""
    client_ip = request.client.host if request.client else "unknown"
    try:
        session = await LabService.create_session(
            ip_address=client_ip,
            db=db,
        )
        return session
    except BlueSentinelError as e:
        return JSONResponse(
            status_code=e.status_code,
            content={"error": e.code, "message": e.message},
        )


@router.get("/scenarios", response_model=List[LabScenario])
async def list_scenarios(
    db=Depends(get_db_session),
) -> List[LabScenario]:
    """List available lab detection scenarios."""
    try:
        return await LabService.list_scenarios(db)
    except Exception:
        logger.error("List scenarios error", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "INTERNAL_ERROR", "message": "Failed to list scenarios"},
        )
