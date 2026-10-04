from fastapi import APIRouter, Depends

from app.cache.redis import get_redis
from app.core.deps import get_db_session
from app.schemas.status import HealthResponse, ReadinessResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=HealthResponse)
async def liveness():
    """Verifica que o processo está vivo."""
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadinessResponse)
async def readiness(db=Depends(get_db_session)):
    """Verifica que dependências (DB, cache) estão prontas."""
    checks: dict[str, str] = {}

    try:
        from sqlalchemy import text
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "fail"

    try:
        await get_redis().ping()
        checks["cache"] = "ok"
    except Exception:
        checks["cache"] = "fail"

    all_ok = all(v == "ok" for v in checks.values())
    return ReadinessResponse(
        status="ok" if all_ok else "degraded",
        checks=checks,
    )
