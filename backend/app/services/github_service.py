import json
import logging

import httpx

from app.cache.redis import get_redis
from app.core.config import settings
from app.core.errors import BlueSentinelError
from app.schemas.github import GitHubStatsResponse, GitHubRepoStats

logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour


class GitHubService:
    """Fetch GitHub stats with Redis cache and graceful fallback."""

    def __init__(self):
        self.token = settings.github_token or None
        self.username = settings.github_username
        self.base_url = "https://api.github.com"
        headers = {"Accept": "application/vnd.github+json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        self.client = httpx.AsyncClient(timeout=10.0, headers=headers)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        await self.client.aclose()

    async def _cache_get(self) -> GitHubStatsResponse | None:
        try:
            raw = await get_redis().get("github:stats")
            if raw:
                return GitHubStatsResponse.model_validate_json(raw)
        except Exception:
            logger.warning("Redis read failed", exc_info=True)
        return None

    async def _cache_set(self, stats: GitHubStatsResponse) -> None:
        try:
            await get_redis().setex(
                "github:stats", CACHE_TTL, stats.model_dump_json()
            )
        except Exception:
            logger.warning("Redis write failed", exc_info=True)

    async def _fetch_from_api(self) -> GitHubStatsResponse:
        try:
            resp = await self.client.get(
                f"{self.base_url}/users/{self.username}/repos",
                params={"sort": "updated", "per_page": 10},
            )
            if resp.status_code == 403:
                raise BlueSentinelError(
                    "GitHub API rate limit exceeded",
                    code="GITHUB_RATE_LIMIT",
                    status_code=429,
                )
            resp.raise_for_status()
            repos = resp.json()
        except httpx.HTTPError as exc:
            raise BlueSentinelError(
                "GitHub API unreachable",
                code="GITHUB_UNREACHABLE",
                status_code=502,
            ) from exc

        featured = [
            GitHubRepoStats(
                name=r.get("name", ""),
                full_name=r.get("full_name", ""),
                description=r.get("description"),
                stars=r.get("stargazers_count", 0),
                forks=r.get("forks_count", 0),
                language=r.get("language"),
                url=r.get("html_url", ""),
            )
            for r in repos
        ]
        return GitHubStatsResponse(
            username=self.username,
            total_repos=len(repos),
            total_stars=sum(r.stars for r in featured),
            total_forks=sum(r.forks for r in featured),
            featured_repos=featured,
            cached=False,
        )

    async def get_stats(self) -> GitHubStatsResponse:
        cached = await self._cache_get()
        if cached:
            cached.cached = True
            return cached

        try:
            stats = await self._fetch_from_api()
        except BlueSentinelError:
            # Fallback: return empty stats instead of failing the page
            logger.warning("GitHub API failed, serving fallback")
            return GitHubStatsResponse(
                username=self.username,
                total_repos=0,
                total_stars=0,
                total_forks=0,
                featured_repos=[],
                cached=False,
            )

        await self._cache_set(stats)
        return stats
