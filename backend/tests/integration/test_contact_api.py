"""API de contato: 202, validação 422, honeypot e rate limits (IP e e-mail)."""

from __future__ import annotations

from app.models.contact_message import ContactMessage
from app.services.contact_service import CONTACT_RATE_LIMIT, ContactService
from tests.factories import contact_payload, create_contact_message


async def test_submit_contact_queues_message(client, db_session):
    payload = contact_payload()
    resp = await client.post("/api/v1/contact", json=payload)

    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "queued"
    assert body["id"] > 0

    saved = await db_session.get(ContactMessage, body["id"])
    assert saved is not None
    assert saved.email == payload["email"]
    assert saved.read is False


async def test_honeypot_is_silently_ignored(client, db_session):
    payload = contact_payload(honeypot="https://spam.example")
    resp = await client.post("/api/v1/contact", json=payload)

    assert resp.status_code == 202
    assert resp.json()["status"] == "ignored"

    from sqlalchemy import select, func
    from app.models.contact_message import ContactMessage

    total = await db_session.scalar(select(func.count()).select_from(ContactMessage))
    assert total == 0


async def test_validation_errors_return_problem_json(client):
    resp = await client.post("/api/v1/contact", json={"email": "not-an-email"})
    assert resp.status_code == 422
    assert resp.headers["content-type"].startswith("application/problem+json")
    body = resp.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert body["status"] == 422
    assert "name" in body["detail"]


async def test_oversized_message_rejected(client):
    payload = contact_payload(message="x" * 5001)
    resp = await client.post("/api/v1/contact", json=payload)
    assert resp.status_code == 422


async def test_email_rate_limit_blocks_after_five_per_hour(client):
    payload = contact_payload()
    for _ in range(CONTACT_RATE_LIMIT):
        assert (await client.post("/api/v1/contact", json=payload)).status_code == 202

    resp = await client.post("/api/v1/contact", json=payload)
    assert resp.status_code == 429
    assert int(resp.headers["Retry-After"]) == 3600
    body = resp.json()
    assert body["code"] == "RATE_LIMIT"
    assert body["title"] == "Too Many Requests"


async def test_ip_rate_limit_blocks_after_ten(client):
    for i in range(10):
        resp = await client.post("/api/v1/contact", json=contact_payload())
        assert resp.status_code == 202, f"request {i} should pass"

    resp = await client.post("/api/v1/contact", json=contact_payload())
    assert resp.status_code == 429
    assert 1 <= int(resp.headers["Retry-After"]) <= 60


async def test_admin_list_requires_auth(client):
    resp = await client.get("/api/v1/admin/messages")
    assert resp.status_code == 401
    body = resp.json()
    assert body["code"] == "UNAUTHORIZED"
    assert resp.headers["content-type"].startswith("application/problem+json")


async def test_admin_list_requires_superuser(client, db_session):
    from tests.factories import auth_headers, create_admin_user

    plain = await create_admin_user(db_session, is_superuser=False)
    resp = await client.get("/api/v1/admin/messages", headers=auth_headers(plain))
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


async def test_admin_list_pagination_and_sort(client, db_session, auth_headers):
    for i in range(3):
        await create_contact_message(db_session, subject=f"assunto {i}")

    resp = await client.get(
        "/api/v1/admin/messages",
        params={"skip": 0, "limit": 2, "sort": "created_at", "direction": "asc"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2


async def test_admin_list_rejects_unsafe_sort(client, auth_headers):
    resp = await client.get(
        "/api/v1/admin/messages",
        params={"sort": "id; DROP TABLE contact_messages"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["error"] == "VALIDATION_ERROR"
    assert "not allowed" in body["message"]


async def test_admin_list_rejects_bad_direction(client, auth_headers):
    resp = await client.get(
        "/api/v1/admin/messages",
        params={"direction": "sideways"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


async def test_admin_mark_read(client, db_session, auth_headers):
    from tests.factories import create_contact_message

    msg_a = await create_contact_message(db_session)
    msg_b = await create_contact_message(db_session)

    resp = await client.post(
        "/api/v1/admin/messages/read",
        json={"message_ids": [msg_a.id, msg_b.id, 999999]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == {"updated": 2}

    await db_session.refresh(msg_a)
    assert msg_a.read is True


async def test_admin_message_list_validation(client, auth_headers):
    resp = await client.get(
        "/api/v1/admin/messages", params={"limit": 500}, headers=auth_headers
    )
    assert resp.status_code == 422


async def test_list_messages_service_direct(db_session):
    """Caminho de página/límite do serviço sem passar pelo HTTP."""
    await create_contact_message(db_session)
    items, total = await ContactService.list_messages(
        db_session, skip=0, limit=10, sort="id", direction="asc"
    )
    assert total >= 1
    assert len(items) >= 1
