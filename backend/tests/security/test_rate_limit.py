"""Rate limiter de janela deslizante (Redis real substituído por fakeredis)."""

from __future__ import annotations

import asyncio

import pytest
from fakeredis import FakeAsyncRedis

from app.core.errors import RateLimitError
from app.middleware.rate_limit import FailureMode, SlidingWindowRateLimiter

WINDOW = 60
LIMIT = 5


class FakeClock:
    def __init__(self, start: float = 1_700_000_000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class _BrokenScript:
    def __call__(self, *_args, **_kwargs):
        raise ConnectionError("redis indisponível")


class _BrokenRedis:
    def register_script(self, _script: str) -> _BrokenScript:
        return _BrokenScript()


@pytest.fixture()
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture()
async def redis_client():
    client = FakeAsyncRedis(decode_responses=True)
    yield client
    await client.aclose()


@pytest.fixture()
def limiter(redis_client, clock) -> SlidingWindowRateLimiter:
    return SlidingWindowRateLimiter(
        redis_client, limit=LIMIT, window_seconds=WINDOW, clock=clock
    )


async def test_allows_up_to_limit_then_blocks(limiter, clock, redis_client):
    for i in range(LIMIT):
        decision = await limiter.hit("ip:1.2.3.4")
        assert decision.allowed
        assert decision.remaining == LIMIT - i - 1

    blocked = await limiter.hit("ip:1.2.3.4")
    assert not blocked.allowed
    assert 1 <= blocked.retry_after <= WINDOW

    key = f"bluesentinel:ratelimit:ip:1.2.3.4:{WINDOW}:{LIMIT}"
    assert await redis_client.exists(key)
    assert 0 < await redis_client.ttl(key) <= WINDOW


async def test_window_slides_instead_of_resetting(limiter, clock):
    for _ in range(LIMIT):
        assert (await limiter.hit("ip:a")).allowed

    clock.advance(WINDOW - 1)
    assert not (await limiter.hit("ip:a")).allowed, "janela ainda cheia: bloqueia"

    clock.advance(2)  # o primeiro evento saiu da janela => sobra 1 vaga
    decision = await limiter.hit("ip:a")
    assert decision.allowed
    assert decision.remaining == LIMIT - 1


async def test_identities_do_not_share_budget(limiter):
    for _ in range(LIMIT):
        await limiter.hit("ip:a")

    assert not (await limiter.hit("ip:a")).allowed
    assert (await limiter.hit("ip:b")).allowed


async def test_concurrent_hits_never_exceed_limit(limiter):
    decisions = await asyncio.gather(*(limiter.hit("ip:c") for _ in range(20)))

    assert sum(1 for d in decisions if d.allowed) == LIMIT


async def test_fail_open_when_redis_is_down(clock):
    limiter = SlidingWindowRateLimiter(
        _BrokenRedis(),
        limit=LIMIT,
        window_seconds=WINDOW,
        failure_mode=FailureMode.OPEN,
        clock=clock,
    )

    decision = await limiter.hit("ip:x")

    assert decision.allowed
    assert decision.retry_after == 0


async def test_fail_closed_when_redis_is_down(clock):
    limiter = SlidingWindowRateLimiter(
        _BrokenRedis(),
        limit=LIMIT,
        window_seconds=WINDOW,
        failure_mode=FailureMode.CLOSED,
        clock=clock,
    )

    decision = await limiter.hit("ip:x")

    assert not decision.allowed
    assert decision.retry_after == WINDOW


async def test_enforce_raises_rate_limit_error_with_retry_after(limiter):
    for _ in range(LIMIT):
        await limiter.hit("ip:y")

    with pytest.raises(RateLimitError) as exc_info:
        await limiter.enforce("ip:y")

    error = exc_info.value
    assert error.status_code == 429
    assert error.code == "RATE_LIMIT"
    assert 1 <= error.retry_after <= WINDOW


def test_invalid_configuration_is_rejected():
    with pytest.raises(ValueError):
        SlidingWindowRateLimiter(_BrokenRedis(), limit=0, window_seconds=WINDOW)
    with pytest.raises(ValueError):
        SlidingWindowRateLimiter(_BrokenRedis(), limit=LIMIT, window_seconds=0)
