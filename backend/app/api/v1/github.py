from fastapi import APIRouter, Depends

from app.core.deps import get_db_session
from app.schemas.github import GitHubStatsResponse
from app.services.github_service import GitHubService

router = APIRouter(prefix="/github", tags=["github"])


@router.get("/stats", response_model=GitHubStatsResponse)
async def github_stats(db=Depends(get_db_session)):
    """Repositórios em destaque e contadores (cache Redis + fallback)."""
    async with GitHubService() as service:
        return await service.get_stats()
