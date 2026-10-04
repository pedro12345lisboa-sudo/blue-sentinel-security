"""Endpooints de saúde: liveness, readiness e métricas públicas."""

from __future__ import annotations

from fakeredis import FakeAsyncRedis

from app.cache.redis import set_redis


async def test_root_endpoint(client):
    resp = await client.get("/")
    assert resp.status_code == 200
    assert resp.json() == {"message": "Blue-Sentinel API", "version": "0.1.0"}


async def test_liveness_is_ok(client):
    resp = await client.get("/api/v1/health/live")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_readiness_all_dependencies_ok(client):
    resp = await client.get("/api/v1/health/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["checks"] == {"database": "ok", "cache": "ok"}


async def test_readiness_degrades_when_cache_is_down(client):
    class _Broken:
        async def ping(self):
            raise ConnectionError("redis down")

    set_redis(_Broken())  # type: ignore[arg-type]
    resp = await client.get("/api/v1/health/ready")
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["checks"]["database"] == "ok"
    assert body["checks"]["cache"] == "fail"


async def test_status_reports_public_metrics(client):
    resp = await client.get("/api/v1/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["database_reachable"] is True
    assert body["cache_reachable"] is True
    assert 0 <= body["cpu_percent"] <= 100
    assert 0 <= body["memory_percent"] <= 100
    assert body["uptime_seconds"] >= 0
    assert body["api_latency_ms"] >= 0


async def test_status_cache_flag_false_when_redis_down(client):
    class _Broken:
        async def ping(self):
            raise ConnectionError("redis down")

    set_redis(_Broken())  # type: ignore[arg-type]
    resp = await client.get("/api/v1/status")
    assert resp.json()["cache_reachable"] is False


async def test_fresh_fakeredis_is_isolated_per_test(client):
    """Guard: cada teste recebe um fakeredis novo (sem vazamento entre testes)."""
    resp = await client.get("/api/v1/status")
    assert resp.json()["cache_reachable"] is True
    assert isinstance(client, object)
    assert FakeAsyncRedis is not None
