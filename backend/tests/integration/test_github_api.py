"""Endpoint de estatísticas GitHub: cache Redis + fallback sem derrubar a página."""

from __future__ import annotations

import httpx

from app.cache.redis import get_redis
from app.core.config import settings
from app.services.github_service import CACHE_TTL, GitHubService

REPOS = [
    {
        "name": "blue-sentinel",
        "full_name": "tester/blue-sentinel",
        "description": "Portfolio",
        "stargazers_count": 7,
        "forks_count": 2,
        "language": "Python",
        "html_url": "https://github.com/tester/blue-sentinel",
    },
    {
        "name": "agent",
        "full_name": "tester/agent",
        "description": None,
        "stargazers_count": 3,
        "forks_count": 1,
        "language": "C++",
        "html_url": "https://github.com/tester/agent",
    },
]


def _service(handler) -> GitHubService:
    service = GitHubService()
    service.client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        headers={"Accept": "application/vnd.github+json"},
    )
    return service


async def test_stats_from_api_then_cached(client):
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json=REPOS)

    async with _service(handler) as service:
        first = await service.get_stats()
        second = await service.get_stats()

    assert calls["n"] == 1, "second call must hit the cache"
    assert first.cached is False and second.cached is True
    assert first.total_repos == 2
    assert first.total_stars == 10
    assert first.total_forks == 3
    assert first.featured_repos[0].name == "blue-sentinel"

    ttl = await get_redis().ttl("github:stats")
    # TTL leva jitter simétrico de ±CACHE_JITTER_RATIO em torno do base.
    max_ttl = int(CACHE_TTL * (1 + settings.cache_jitter_ratio)) + 1
    assert 0 < ttl <= max_ttl


async def test_api_unreachable_returns_fallback(client):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    async with _service(handler) as service:
        stats = await service.get_stats()

    assert stats.total_repos == 0
    assert stats.featured_repos == []
    assert stats.cached is False


async def test_rate_limited_api_returns_fallback(client):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"message": "rate limited"})

    async with _service(handler) as service:
        stats = await service.get_stats()

    assert stats.total_repos == 0


async def test_bad_gateway_returns_fallback(client):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(502)

    async with _service(handler) as service:
        stats = await service.get_stats()

    assert stats.total_repos == 0


async def test_endpoint_returns_stats(client):
    """Endpoint com transport mockado no serviço (via monkeypatch do construtor)."""
    import app.api.v1.github as github_api

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=REPOS)

    original = github_api.GitHubService

    class _Mocked(original):  # type: ignore[misc, valid-type]
        def __init__(self):
            super().__init__()
            self.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    github_api.GitHubService = _Mocked
    try:
        resp = await client.get("/api/v1/github/stats")
    finally:
        github_api.GitHubService = original

    assert resp.status_code == 200
    body = resp.json()
    assert body["total_repos"] == 2
    assert body["username"]


async def test_cache_survives_redis_failure(client):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=REPOS)

    from app.cache import redis as redis_module

    class _Broken:
        async def get(self, *_a, **_k):
            raise ConnectionError("down")

        async def setex(self, *_a, **_k):
            raise ConnectionError("down")

    redis_module.set_redis(_Broken())  # type: ignore[arg-type]
    async with _service(handler) as service:
        stats = await service.get_stats()

    assert stats.total_repos == 2
    assert stats.cached is False
