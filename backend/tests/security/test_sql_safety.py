"""Segurança de SQL: parametrização, allowlist de ORDER BY e guard de concatenação.

Cobre as três defesas do artigo "SQL Injection em FastAPI":
consultas parametrizadas/ORM, ORDER BY por allowlist e um teste que falha se
alguém reintroduzir SQL construída por concatenação/f-string.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.errors import ValidationError
from app.database.session import Base
from app.models.contact_message import ContactMessage
from app.security.sql_injection import UnsafeSortError, apply_sort
from app.services.contact_service import MESSAGE_SORTABLE, MESSAGE_SORT_DEFAULT, ContactService

BACKEND_ROOT = Path(__file__).resolve().parents[3]
APP_DIR = BACKEND_ROOT / "app"

PAYLOAD = "x' OR '1'='1"

FORBIDDEN_SQL_PATTERNS = (
    re.compile(r"\btext\(\s*f['\"]"),
    re.compile(r"\bexecute\(\s*f['\"]"),
    re.compile(r"\bexec_driver_sql\(\s*f['\"]"),
)


@pytest.fixture()
def engine() -> Engine:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def session(engine: Engine) -> Session:
    db = Session(engine)
    db.add_all(
        [
            ContactMessage(name="Ana", email="ana@example.com", message="oi", subject="Suporte"),
            ContactMessage(name="Beto", email="beto@example.com", message="oi", subject="Vendas"),
        ]
    )
    db.commit()
    yield db
    db.rollback()
    db.close()


def test_parametrized_filter_treats_payload_as_plain_string(session: Session, engine: Engine):
    stmt = select(ContactMessage).where(ContactMessage.email == PAYLOAD)
    rows = session.execute(stmt).scalars().all()

    assert rows == []

    compiled = str(stmt.compile(dialect=engine.dialect))
    assert PAYLOAD not in compiled, "o payload apareceu no texto da SQL (não é um bind)"


def test_antipattern_concatenated_sql_matches_every_row(session: Session):
    """Documenta o anti-padrão: SQL montada com f-string é injetável.

    Este teste prova *por que* o guard abaixo existe: com a SQL concatenada,
    o payload `x' OR '1'='1` fecha a aspa, vira uma condição verdadeira e
    devolve todas as linhas. A versão parametrizada devolve zero.
    """
    naive = text(f"SELECT * FROM contact_messages WHERE email = '{PAYLOAD}'")
    matched = session.execute(naive).all()
    total = session.execute(text("SELECT COUNT(*) FROM contact_messages")).scalar()

    assert total == 2
    assert len(matched) == total


def test_source_tree_contains_no_interpolated_sql():
    """Falta o build se alguém escrever SQL por f-string em app/."""
    offenders: list[str] = []
    for path in sorted(APP_DIR.rglob("*.py")):
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if any(pattern.search(line) for pattern in FORBIDDEN_SQL_PATTERNS):
                rel = path.relative_to(BACKEND_ROOT)
                offenders.append(f"{rel}:{lineno}: {line.strip()}")

    assert not offenders, "SQL por concatenação/f-string detectada:\n" + "\n".join(offenders)


def test_allowlist_orders_by_mapped_column(engine: Engine):
    stmt = apply_sort(
        select(ContactMessage),
        sort="subject",
        direction="asc",
        allowed=MESSAGE_SORTABLE,
        default=MESSAGE_SORT_DEFAULT,
    )
    compiled = str(stmt.compile(dialect=engine.dialect))

    assert "ORDER BY contact_messages.subject ASC" in compiled


def test_allowlist_defaults_to_newest_first(engine: Engine):
    stmt = apply_sort(
        select(ContactMessage),
        sort=None,
        direction=None,
        allowed=MESSAGE_SORTABLE,
        default=MESSAGE_SORT_DEFAULT,
    )
    compiled = str(stmt.compile(dialect=engine.dialect))

    assert "ORDER BY contact_messages.created_at DESC" in compiled


@pytest.mark.parametrize(
    "bad_sort",
    [
        "created_at; DROP TABLE contact_messages",
        "password",
        "1=1",
        "created_at DESC --",
        "contact_messages.read",
    ],
)
def test_allowlist_rejects_unknown_or_injected_sort(bad_sort: str):
    with pytest.raises(UnsafeSortError):
        apply_sort(
            select(ContactMessage),
            sort=bad_sort,
            direction=None,
            allowed=MESSAGE_SORTABLE,
            default=MESSAGE_SORT_DEFAULT,
        )


@pytest.mark.parametrize("bad_direction", ["asc; DROP TABLE x", "up", "descending"])
def test_allowlist_rejects_invalid_direction(bad_direction: str):
    with pytest.raises(UnsafeSortError):
        apply_sort(
            select(ContactMessage),
            sort="created_at",
            direction=bad_direction,
            allowed=MESSAGE_SORTABLE,
            default=MESSAGE_SORT_DEFAULT,
        )


class _StubDB:
    """Sessão falsa: falha o teste se qualquer query chegar a executar."""

    async def scalar(self, *_args, **_kwargs):
        raise AssertionError("consulta executada antes da validação do sort")

    async def execute(self, *_args, **_kwargs):
        raise AssertionError("consulta executada antes da validação do sort")


async def test_list_messages_rejects_unsafe_sort_before_touching_the_db():
    with pytest.raises(ValidationError) as exc_info:
        await ContactService.list_messages(
            _StubDB(), sort="created_at; DROP TABLE contact_messages"
        )

    assert "not allowed" in exc_info.value.message
