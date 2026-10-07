"""Ambiente Alembic (assíncrono) — ``alembic upgrade head``.

* URL vem de ``DATABASE_URL`` (container) ou das ``POSTGRES_*`` do Settings.
* Modelos são importados para que ``autogenerate`` enxergue o metadata.
* Uso: ``alembic upgrade head`` (deploy) / ``alembic revision --autogenerate -m "..."``.
"""

from __future__ import annotations

import asyncio
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# ``/app`` no container (alembic.ini e app/ ficam no mesmo nível).
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings  # noqa: E402
from app.database.base import Base  # noqa: E402

# Registra todas as tabelas no metadata do Base (necessário p/ autogenerate).
from app.models import (  # noqa: E402,F401
    admin_user,
    audit_log,
    contact_message,
    lab_session,
)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    """DATABASE_URL > Settings; normaliza para ``postgresql+asyncpg://``."""
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        url = (
            f"postgresql+asyncpg://{settings.postgres_user}:{settings.postgres_password}"
            f"@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}"
        )
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


# configparser interpreta ``%`` — escapa para qualquer URL vinda do ambiente.
config.set_main_option("sqlalchemy.url", _database_url().replace("%", "%%"))


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
