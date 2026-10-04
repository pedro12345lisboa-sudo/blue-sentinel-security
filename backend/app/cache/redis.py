"""Cliente Redis compartilhado (lazy: nenhuma conexão antes do 1º comando)."""

from __future__ import annotations

import logging

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    """Singleton do cliente Redis do processo.

    `redis.Redis` não abre socket no construtor, então é seguro chamar no
    import de módulos; a conexão só acontece no primeiro comando e falhas
    são tratadas pelos chamadores (ex.: fail-open do rate limiter).
    """
    global _client
    if _client is None:
        _client = aioredis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            password=settings.redis_password or None,
            decode_responses=True,
            socket_timeout=1.0,
            socket_connect_timeout=1.0,
            health_check_interval=30,
        )
    return _client


def set_redis(client: aioredis.Redis | None) -> None:
    """Permite injetar um cliente (testes com fakeredis, reset entre testes)."""
    global _client
    _client = client


async def close_redis() -> None:
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:
            logger.warning("Redis close failed", exc_info=True)
        finally:
            _client = None
