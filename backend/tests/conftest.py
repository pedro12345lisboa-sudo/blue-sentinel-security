"""Shared fixtures: isolated database, fakeredis, ASGI client and auth helpers.

Design rules (see docs/testing.md):

* **No real PII** — factories generate ``example.com`` addresses only.
* **Independent & order-free** — every test starts from empty tables, a fresh
  fakeredis instance and a cleared lab-session rate-limit bucket.
* **Zero services required** — defaults to a temporary SQLite file plus
  fakeredis so ``pytest`` passes on a clean machine. CI sets
  ``TEST_DATABASE_URL`` (Postgres) and ``TEST_REDIS_URL`` (Redis) to run the
  same suite against real services (see the ``live`` marker).
"""

from __future__ import annotations

import logging
import os
import pathlib
import tempfile

_TMP_DIR = pathlib.Path(tempfile.gettempdir()) / "blue-sentinel-tests"
_TMP_DIR.mkdir(exist_ok=True)
_DB_PATH = _TMP_DIR / f"test-{os.getpid()}.db"

# Must be set *before* the application is imported (engine is built at import).
os.environ.setdefault(
    "DATABASE_URL", os.environ.get("TEST_DATABASE_URL") or f"sqlite+aiosqlite:///{_DB_PATH}"
)
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault(
    "ALLOWED_HOSTS",
    "http://localhost:3000,http://localhost:8000,http://127.0.0.1:3000",
)

from fakeredis import FakeAsyncRedis  # noqa: E402
from app.cache.redis import set_redis  # noqa: E402

set_redis(FakeAsyncRedis(decode_responses=True))

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from main import app  # noqa: E402
from app.api.v1.contact import contact_ip_limiter  # noqa: E402
from app.api.v1 import ws_lab  # noqa: E402
from app.database.session import Base, async_session_maker, engine  # noqa: E402
from app.services import lab_service  # noqa: E402

# Keep the suite output readable: application logs are asserted via caplog.
logging.getLogger().setLevel(logging.WARNING)

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
RULES_ROOT = REPO_ROOT / "rules"


@pytest.fixture(scope="session")
def rules_root() -> pathlib.Path:
    """Repository rules directory (sigma + yara + correlation patterns)."""
    return RULES_ROOT


@pytest.fixture(autouse=True)
async def _fresh_state():
    """Empty tables + fresh fakeredis + cleared in-memory buckets per test."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    redis_client = FakeAsyncRedis(decode_responses=True)
    set_redis(redis_client)
    contact_ip_limiter.bind_client(redis_client)
    lab_service._session_creations.clear()
    ws_lab._active_connections.clear()

    yield

    lab_service._session_creations.clear()
    ws_lab._active_connections.clear()
    set_redis(None)
    # Drop pooled connections so the next test (own event loop) starts clean.
    await engine.dispose()


@pytest.fixture
async def client() -> AsyncClient:
    """httpx client bound to the FastAPI app (no lifespan; state via fixtures)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest.fixture
def ws_client():
    """Starlette TestClient síncrono (necessário para WebSocketTestSession)."""
    from starlette.testclient import TestClient

    return TestClient(app)


@pytest.fixture
async def db_session():
    """Dedicated database session for seeding/asserting inside tests."""
    async with async_session_maker() as session:
        yield session


@pytest.fixture
async def admin_user(db_session):
    """Active superuser seeded in the isolated database."""
    from tests.factories import create_admin_user

    return await create_admin_user(db_session)


@pytest.fixture
def auth_headers(admin_user):
    """Bearer headers for an active superuser."""
    from tests.factories import auth_headers as _headers

    return _headers(admin_user)
