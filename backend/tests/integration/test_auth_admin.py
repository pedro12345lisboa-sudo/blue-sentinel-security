"""Login (JWT) e o painel admin protegido por require_admin."""

from __future__ import annotations

from app.api.v1.auth import create_access_token, decode_token
from tests.factories import DEFAULT_PASSWORD, contact_payload, create_admin_user


async def test_login_returns_token(client, db_session):
    user = await create_admin_user(db_session, username="logintest")
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "logintest", "password": DEFAULT_PASSWORD},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 3600
    assert decode_token(body["access_token"]) == user.id


async def test_login_wrong_password(client, db_session):
    await create_admin_user(db_session, username="logintest")
    resp = await client.post(
        "/api/v1/auth/login", json={"username": "logintest", "password": "wrong-password"}
    )
    assert resp.status_code == 401
    body = resp.json()
    assert body["code"] == "UNAUTHORIZED"
    assert body["status"] == 401


async def test_login_unknown_user(client):
    resp = await client.post(
        "/api/v1/auth/login", json={"username": "ghost", "password": "whatever123"}
    )
    assert resp.status_code == 401


async def test_login_disabled_account(client, db_session):
    await create_admin_user(
        db_session, username="disabled", is_active=False, is_superuser=True
    )
    resp = await client.post(
        "/api/v1/auth/login", json={"username": "disabled", "password": DEFAULT_PASSWORD}
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


async def test_login_payload_validation(client):
    resp = await client.post("/api/v1/auth/login", json={"username": "ab"})
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_ERROR"


async def test_token_helpers():
    token = create_access_token(42)
    assert decode_token(token) == 42
    assert decode_token("not.a.token") is None
    assert decode_token("") is None


async def test_admin_requires_token_then_superuser(client, db_session):
    assert (await client.get("/api/v1/admin/messages")).status_code == 401

    token = create_access_token(999999)  # usuário inexistente
    resp = await client.get(
        "/api/v1/admin/messages", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "User not found or inactive"

    assert (
        await client.get(
            "/api/v1/admin/messages", headers={"Authorization": "Bearer garbage"}
        )
    ).status_code == 401

    resp = await client.get("/api/v1/admin/messages")
    assert "WWW-Authenticate" in resp.headers


async def test_admin_flow_happy_path(client, db_session, auth_headers):
    payload = contact_payload()
    assert (await client.post("/api/v1/contact", json=payload)).status_code == 202

    listing = await client.get("/api/v1/admin/messages", headers=auth_headers)
    assert listing.status_code == 200
    items = listing.json()["items"]
    assert any(i["email"] == payload["email"] for i in items)

    target = next(i for i in items if i["email"] == payload["email"])
    marked = await client.post(
        "/api/v1/admin/messages/read",
        json={"message_ids": [target["id"]]},
        headers=auth_headers,
    )
    assert marked.status_code == 200 and marked.json()["updated"] == 1

    listing2 = await client.get("/api/v1/admin/messages", headers=auth_headers)
    assert next(
        i for i in listing2.json()["items"] if i["id"] == target["id"]
    )["read"] is True


async def test_admin_mark_read_validation(client, auth_headers):
    resp = await client.post(
        "/api/v1/admin/messages/read", json={"message_ids": []}, headers=auth_headers
    )
    assert resp.status_code == 422
