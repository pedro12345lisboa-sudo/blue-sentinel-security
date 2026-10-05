from fastapi import APIRouter, Depends

from app.core.deps import get_db_session
from app.monitoring.health_check import readiness
from app.schemas.status import HealthResponse, ReadinessResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=HealthResponse)
async def liveness():
    """Verifica que o processo está vivo."""
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadinessResponse)
async def readiness_endpoint(db=Depends(get_db_session)):
    """Verifica que dependências (Postgres, cache, disco) estão prontas."""
    status, checks, latency = await readiness(db)
    return ReadinessResponse(status=status, checks=checks, latency_ms=latency)
