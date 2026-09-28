from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
import redis.asyncio as redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.database.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health/live", tags=["health"], summary="Liveness check")
async def live_check():
    """Liveness check - verifies the application is running.
    Does not depend on external services.
    """
    return {"status": "alive"}


@router.get("/health/ready", tags=["health"], summary="Readiness check")
async def ready_check(db: AsyncSession = Depends(get_db)):
    """Readiness check - verifies the application is ready to serve traffic.
    Checks connectivity to PostgreSQL and Redis.
    Returns 503 if any dependency is unavailable.
    """
    checks: dict[str, any] = {"status": "ready", "checks": {}}

    # Check PostgreSQL
    try:
        await db.execute(text("SELECT 1"))
        checks["checks"]["postgres"] = "healthy"
    except SQLAlchemyError as e:
        checks["checks"]["postgres"] = f"unhealthy: {str(e)}"

    # Check Redis
    redis_client = None
    try:
        redis_client = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            password=settings.redis_password if settings.redis_password != "changeme_default_must_overwrite" else None,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        await redis_client.ping()
        checks["checks"]["redis"] = "healthy"
    except RedisError as e:
        checks["checks"]["redis"] = f"unhealthy: {str(e)}"
    finally:
        if redis_client:
            await redis_client.close()

    if checks["checks"]["postgres"] != "healthy" or checks["checks"]["redis"] != "healthy":
        checks["status"] = "not_ready"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=checks,
        )

    return checks