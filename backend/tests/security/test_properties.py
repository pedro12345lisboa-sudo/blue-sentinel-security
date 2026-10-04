"""Propriedades (hypothesis) das proteções de segurança.

Sem PII: qualquer texto gerado é tratado como opaco — o formulário de contato
aceita (202), rejeita (422) ou limita (429), mas nunca responde 500.
"""

from __future__ import annotations

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy import select
from sqlalchemy.dialects import sqlite

from app.collectors.normalizer import (
    CATEGORIES,
    NormalizationError,
    normalize,
    parse_timestamp,
)
from app.models.contact_message import ContactMessage
from app.security.sql_injection import UnsafeSortError, apply_sort
from app.services.contact_service import MESSAGE_SORTABLE, MESSAGE_SORT_DEFAULT

ALLOWED_SORTS = set(MESSAGE_SORTABLE)
INJECTION_MARKERS = ("drop table", "--", ";", "'", '"', "/*")


def _compile(statement) -> str:
    return str(statement.compile(dialect=sqlite.dialect()))


@given(sort=st.text(max_size=80))
@settings(max_examples=200, deadline=None)
def test_sort_key_never_reaches_sql_unless_allowlisted(sort: str):
    """Ou a chave é rejeitada, ou é exatamente uma coluna da allowlist."""
    statement = select(ContactMessage)
    try:
        compiled = _compile(
            apply_sort(
                statement,
                sort=sort,
                direction="desc",
                allowed=MESSAGE_SORTABLE,
                default=MESSAGE_SORT_DEFAULT,
            )
        )
    except UnsafeSortError:
        return

    assert sort == "" or sort.strip() in ALLOWED_SORTS
    if sort.strip():
        assert not any(marker in sort.strip().lower() for marker in INJECTION_MARKERS)


@given(direction=st.text(max_size=40))
@settings(max_examples=200, deadline=None)
def test_direction_only_asc_or_desc(direction: str):
    statement = select(ContactMessage)
    try:
        compiled = _compile(
            apply_sort(
                statement,
                sort="id",
                direction=direction,
                allowed=MESSAGE_SORTABLE,
                default=MESSAGE_SORT_DEFAULT,
            )
        )
    except UnsafeSortError:
        return

    assert direction == "" or direction.strip().lower() in ("asc", "desc")
    assert "ORDER BY" in compiled


@given(
    timestamp=st.sampled_from(
        [
            "2026-01-01T12:00:00Z",
            "2026-01-01T12:00:00+00:00",
            "2026-01-01T12:00:00",
            "2026-06-30T23:59:59.5Z",
        ]
    )
)
def test_parse_timestamp_always_utc(timestamp: str):
    dt = parse_timestamp(timestamp)
    assert dt.tzinfo is not None
    assert 0 <= dt.hour <= 23
    assert dt.utcoffset().total_seconds() == 0


@given(
    hour=st.integers(min_value=0, max_value=23),
    minute=st.integers(min_value=0, max_value=59),
    second=st.integers(min_value=0, max_value=59),
    category=st.sampled_from(CATEGORIES),
)
def test_normalize_stamps_hour_and_defaults(hour, minute, second, category):
    record = {
        "timestamp": f"2026-03-10T{hour:02d}:{minute:02d}:{second:02d}Z",
        "category": category,
        "host": "HOST-X",
    }
    event = normalize(record, event_id="evt-prop")

    assert event["id"] == "evt-prop"
    assert event["hour"] == hour
    assert event["category"] == category
    assert event["host"] == "HOST-X"
    assert event["user"] == "-"  # default preenchido
    assert event["raw"] == record
    assert event["timestamp"].endswith("Z")


@given(category=st.text(max_size=30))
def test_normalize_rejects_unknown_categories(category: str):
    if category.lower() in CATEGORIES:
        return  # caminho positivo coberto por test_normalize_stamps_hour...
    with pytest.raises(NormalizationError):
        normalize(
            {"timestamp": "2026-01-01T00:00:00Z", "category": category, "x": "junk"}
        )


def test_normalize_missing_required_fields():
    with pytest.raises(NormalizationError):
        normalize({})
    with pytest.raises(NormalizationError):
        normalize({"timestamp": "2026-01-01T00:00:00Z"})


@given(
    name=st.text(max_size=300),
    subject=st.text(max_size=300),
    message=st.text(max_size=6000),
)
@settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
async def test_contact_endpoint_never_returns_500(name, subject, message):
    """Qualquer corpo (inclusive malicioso) produz 202/422/429 — nunca 500."""
    from httpx import ASGITransport, AsyncClient

    from main import app

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/contact",
            json={
                "name": name,
                "email": "propriedade@example.com",
                "subject": subject,
                "message": message,
            },
        )

    assert response.status_code in (202, 422, 429), response.text[:300]
