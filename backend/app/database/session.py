import logging
import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.database.base import Base  # noqa: F401  (re-exported for models)

logger = logging.getLogger(__name__)

# Permite override via env (SQLite para testes/dev sem Postgres)
DATABASE_URL = os.environ.get("DATABASE_URL") or (
    f"postgresql+asyncpg://{settings.postgres_user}:{settings.postgres_password}"
    f"@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}"
)

engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=settings.debug and not DATABASE_URL.startswith("sqlite"),
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db():
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    """Cria as tabelas. Falha graciosamente se o banco estiver indisponível."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables ensured")
    except Exception:
        logger.warning(
            "Database unavailable at startup — tabelas serão criadas no primeiro acesso",
            exc_info=settings.debug,
        )


async def dispose_engine() -> None:
    await engine.dispose()
