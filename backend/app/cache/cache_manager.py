"""Cache-aside genérico sobre Redis.

Garantias (ver docs/architecture/performance.md):

* **TTL com jitter** — o tempo de vida de cada entrada varia em torno do TTL
  base, evitando que um conjunto de chaves expire todo no mesmo instante e
  dispare um thundering herd contra a fonte de dados.
* **Proteção contra stampede** — um lock por chave (in-process + ``SET NX`` no
  Redis) garante que apenas uma correra regenere o valor; as demais esperam e
  reaproveitam o resultado.
* **Fallback stale** — cada escrita também grava um espelho de vida longa
  (``<key>:stale``). Se a fonte (ex.: API do GitHub) falhar, o valor antigo é
  servido em vez de erro ou payload vazio.
* **Redis opcional** — qualquer falha do Redis degrada para "miss" e o dado é
  recalculado; o site continua de pé sem cache.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from app.cache.redis import get_redis
from app.core.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

STALE_SUFFIX = ":stale"
LOCK_SUFFIX = ":lock"


@dataclass(frozen=True)
class CacheResult(Generic[T]):
    """Resultado de :meth:`CacheManager.get_or_set`."""

    value: T
    hit: bool
    stale: bool = False

    @property
    def miss(self) -> bool:
        return not self.hit


class CacheManager:
    """Cache-aside com jitter, anti-stampede e fallback stale."""

    def __init__(
        self,
        *,
        prefix: str = "",
        ttl: int | None = None,
        jitter_ratio: float | None = None,
        stale_ttl: int | None = None,
        lock_ttl: int | None = None,
        serializer: Callable[[Any], str] | None = None,
        deserializer: Callable[[str], Any] | None = None,
    ) -> None:
        self.prefix = prefix
        self.ttl = ttl if ttl is not None else settings.cache_default_ttl
        self.jitter_ratio = (
            jitter_ratio if jitter_ratio is not None else settings.cache_jitter_ratio
        )
        self.stale_ttl = stale_ttl if stale_ttl is not None else settings.cache_stale_ttl
        self.lock_ttl = lock_ttl if lock_ttl is not None else settings.cache_lock_ttl
        self._serialize = serializer or json.dumps
        self._deserialize = deserializer or json.loads
        self._locks: dict[str, asyncio.Lock] = {}

    # ----------------------------------------------------------------- keys
    def _key(self, key: str) -> str:
        return f"{self.prefix}:{key}" if self.prefix else key

    def _ttl_with_jitter(self) -> int:
        return ttl_with_jitter(self.ttl, self.jitter_ratio)

    def _lock_for(self, key: str) -> asyncio.Lock:
        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
        return lock

    # --------------------------------------------------------------- read/write
    async def get(self, key: str) -> Any | None:
        """Lê a entrada fresca. ``None`` em caso de miss ou falha do Redis."""
        raw = await self._read(self._key(key))
        if raw is None:
            return None
        return self._decode(raw)

    async def get_stale(self, key: str) -> Any | None:
        """Lê o espelho stale (vida longa), usado quando a fonte falha."""
        raw = await self._read(self._key(key) + STALE_SUFFIX)
        if raw is None:
            return None
        return self._decode(raw)

    async def _read(self, storage_key: str) -> str | None:
        try:
            return await get_redis().get(storage_key)
        except Exception:
            logger.warning("Redis read failed key=%s", storage_key, exc_info=True)
            return None

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        """Grava valor fresca (TTL com jitter) + espelho stale (vida longa)."""
        storage_key = self._key(key)
        effective_ttl = ttl if ttl is not None else self.ttl
        try:
            payload = self._serialize(value)
        except (TypeError, ValueError):
            logger.warning("Cache value not serializable key=%s", key, exc_info=True)
            return
        try:
            redis = get_redis()
            await redis.set(
                storage_key, payload, ex=ttl_with_jitter(effective_ttl, self.jitter_ratio)
            )
            await redis.set(
                storage_key + STALE_SUFFIX,
                payload,
                ex=max(effective_ttl, self.stale_ttl),
            )
        except Exception:
            logger.warning("Redis write failed key=%s", key, exc_info=True)

    async def delete(self, key: str) -> None:
        storage_key = self._key(key)
        try:
            await get_redis().delete(storage_key, storage_key + STALE_SUFFIX)
        except Exception:
            logger.warning("Redis delete failed key=%s", key, exc_info=True)

    def _decode(self, raw: str) -> Any | None:
        try:
            return self._deserialize(raw)
        except Exception:
            logger.warning("Cache payload unreadable — tratando como miss", exc_info=True)
            return None

    # -------------------------------------------------------------- cache-aside
    async def get_or_set(
        self,
        key: str,
        factory: Callable[[], Awaitable[T]],
        *,
        ttl: int | None = None,
        allow_stale: bool = True,
    ) -> CacheResult[T]:
        """Cache-aside: devolve o valor fresco ou executa ``factory``.

        Em caso de falha de ``factory`` devolve o espelho stale (se existir) em
        vez de propagar o erro — a fonte pode voltar na próxima chamada.
        """
        cached = await self.get(key)
        if cached is not None:
            return CacheResult(value=cached, hit=True)

        async with self._lock_for(key):
            # Double-check: outra correr pode ter acabado de popular.
            cached = await self.get(key)
            if cached is not None:
                return CacheResult(value=cached, hit=True)

            lock_state = await self._acquire_remote_lock(key)
            if lock_state == "busy":
                # Outra réplica está regenerando: espera ela publicar o valor
                # (backoff curto) em vez de ampliar o thundering herd.
                waited = await self._wait_for_value(key)
                if waited is not None:
                    return CacheResult(value=waited, hit=True)
            try:
                value = await factory()
            except Exception:
                if allow_stale:
                    stale = await self.get_stale(key)
                    if stale is not None:
                        logger.warning(
                            "Factory failed — serving stale value key=%s", key
                        )
                        return CacheResult(value=stale, hit=True, stale=True)
                raise
            else:
                await self.set(key, value, ttl=ttl)
                return CacheResult(value=value, hit=False)
            finally:
                if lock_state == "acquired":
                    await self._release_remote_lock(key)

    async def _wait_for_value(self, key: str, *, attempts: int = 20) -> Any | None:
        """Aguarda (polling curto) outra réplica publicar o valor no cache."""
        for _ in range(attempts):
            await asyncio.sleep(0.05)
            value = await self.get(key)
            if value is not None:
                return value
        return None

    async def _acquire_remote_lock(self, key: str) -> str:
        """Lock distribuído best-effort.

        Retorna ``"acquired"``, ``"busy"`` (outra réplica detém o lock) ou
        ``"unknown"`` (Redis indisponível — segue sem lock, nunca bloqueia).
        """
        try:
            ok = await get_redis().set(
                self._key(key) + LOCK_SUFFIX,
                "1",
                nx=True,
                ex=max(1, self.lock_ttl),
            )
        except Exception:
            logger.debug("Redis lock unavailable key=%s", key, exc_info=True)
            return "unknown"
        return "acquired" if ok else "busy"

    async def _release_remote_lock(self, key: str) -> None:
        try:
            await get_redis().delete(self._key(key) + LOCK_SUFFIX)
        except Exception:
            logger.debug("Redis lock release failed key=%s", key, exc_info=True)


def ttl_with_jitter(
    ttl: int, jitter_ratio: float | None = None, rng: random.Random | None = None
) -> int:
    """TTL base com jitter simétrico (função pura, testável com ``rng`` fixo)."""
    ratio = settings.cache_jitter_ratio if jitter_ratio is None else jitter_ratio
    spread = max(0.0, min(ratio, 0.9))
    source = rng or random
    factor = 1.0 + source.uniform(-spread, spread)
    return max(1, int(round(ttl * factor)))
