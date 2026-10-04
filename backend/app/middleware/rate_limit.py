"""Rate limiting com janela deslizante em Redis (ZSET + script Lua atômico).

Por que janela deslizante: a janela fixa ("n por minuto" a cada :00) deixa o
cliente fazer 2n requests nas viradas de minuto. O ZSET guarda o timestamp de
cada request; a cada hit removemos as entradas fora da janela, contamos as
restantes e só inserimos se couber -- tudo em **um único** `EVAL` (script Lua),
para que duas requisições concorrentes não leiam o mesmo `ZCARD`.

Falha do Redis: política explícita via :class:`FailureMode`.
``OPEN`` (padrão) deixa passar quando o Redis está fora do ar; ``CLOSED``
bloqueia. Rate limit é controlo de abuso, não controle de acesso -- a decisão
dependerá do vetor de ataque (DDoS volumétrico não se resolve aqui).
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from enum import Enum
from typing import Any, Awaitable, Callable, Protocol, Sequence

from app.core.config import settings
from app.core.errors import RateLimitError

logger = logging.getLogger(__name__)

KEY_PREFIX = "bluesentinel:ratelimit"

SLIDING_WINDOW_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local ttl = tonumber(ARGV[5])

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local used = redis.call('ZCARD', key)
if used < limit then
  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, ttl)
  return {1, limit - used - 1, 0}
end

local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retry_after = window
if oldest[2] then
  retry_after = math.ceil(tonumber(oldest[2]) + window - now)
end
if retry_after < 1 then
  retry_after = 1
end
return {0, 0, retry_after}
"""


class Script(Protocol):
    def __call__(
        self, keys: Sequence[str], args: Sequence[Any]
    ) -> Awaitable[Any]: ...


class RedisLike(Protocol):
    def register_script(self, script: str) -> Script: ...


class FailureMode(str, Enum):
    """O que fazer quando o Redis não responde."""

    OPEN = "open"  # indisponibilidade => deixa passar (disponibilidade > limite)
    CLOSED = "closed"  # indisponibilidade => bloqueia (limite > disponibilidade)

    @classmethod
    def from_settings(cls) -> "FailureMode":
        return cls.CLOSED if settings.rate_limit_fail_closed else cls.OPEN


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    remaining: int
    retry_after: int


def _as_int(value: Any) -> int:
    return int(float(value))


class SlidingWindowRateLimiter:
    def __init__(
        self,
        client: RedisLike,
        *,
        limit: int,
        window_seconds: int,
        failure_mode: FailureMode = FailureMode.OPEN,
        clock: Callable[[], float] = time.time,
        key_prefix: str = KEY_PREFIX,
    ) -> None:
        if limit < 1:
            raise ValueError("limit must be >= 1")
        if window_seconds < 1:
            raise ValueError("window_seconds must be >= 1")
        self._limit = limit
        self._window = window_seconds
        self._failure_mode = failure_mode
        self._clock = clock
        self._key_prefix = key_prefix
        self._client = client
        self._script: Script = client.register_script(SLIDING_WINDOW_SCRIPT)

    def bind_client(self, client: RedisLike) -> None:
        """Troca o cliente Redis do limiter (testes injetam fakeredis por teste)."""
        self._client = client
        self._script = client.register_script(SLIDING_WINDOW_SCRIPT)

    @property
    def limit(self) -> int:
        return self._limit

    @property
    def window_seconds(self) -> int:
        return self._window

    @property
    def failure_mode(self) -> FailureMode:
        return self._failure_mode

    def _key(self, identity: str) -> str:
        return f"{self._key_prefix}:{identity}:{self._window}:{self._limit}"

    async def hit(self, identity: str) -> RateLimitDecision:
        """Registra um request para `identity` e devolve a decisão."""
        now = self._clock()
        member = uuid.uuid4().hex
        try:
            raw = await self._script(
                keys=[self._key(identity)],
                args=[
                    f"{now:.6f}",
                    self._window,
                    self._limit,
                    member,
                    self._window,
                ],
            )
        except Exception:
            logger.warning(
                "Rate limit backend unavailable (fail-%s)",
                self._failure_mode.value,
                exc_info=True,
            )
            if self._failure_mode is FailureMode.OPEN:
                return RateLimitDecision(allowed=True, remaining=self._limit, retry_after=0)
            return RateLimitDecision(
                allowed=False, remaining=0, retry_after=self._window
            )

        allowed, remaining, retry_after = raw
        return RateLimitDecision(
            allowed=_as_int(allowed) == 1,
            remaining=max(0, _as_int(remaining)),
            retry_after=max(0, _as_int(retry_after)),
        )

    async def enforce(self, identity: str) -> RateLimitDecision:
        """:meth:`hit`, mas levanta :class:`RateLimitError` (429) se bloqueado."""
        decision = await self.hit(identity)
        if not decision.allowed:
            raise RateLimitError(retry_after=decision.retry_after)
        return decision
