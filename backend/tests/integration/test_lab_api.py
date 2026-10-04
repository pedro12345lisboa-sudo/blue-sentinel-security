"""API REST do laboratório: sessões, cenários e catálogo de regras."""

from __future__ import annotations


async def test_create_session_returns_ticket(client):
    resp = await client.post("/api/v1/lab/sessions")
    assert resp.status_code == 201
    body = resp.json()
    assert body["session_id"].startswith("sess-")
    assert body["ticket"].startswith("tk-")
    assert body["expires_at"]


async def test_create_session_rate_limited_per_ip(client):
    for i in range(10):
        assert (await client.post("/api/v1/lab/sessions")).status_code == 201, i

    resp = await client.post("/api/v1/lab/sessions")
    assert resp.status_code == 429
    assert int(resp.headers["Retry-After"]) >= 1
    body = resp.json()
    assert body["error"] == "RATE_LIMIT"


async def test_list_scenarios(client):
    resp = await client.get("/api/v1/lab/scenarios")
    assert resp.status_code == 200
    scenarios = resp.json()
    assert len(scenarios) == 5
    ids = {s["id"] for s in scenarios}
    assert "brute-force" in ids and "sqli-web" in ids
    for s in scenarios:
        assert s["event_count"] > 0
        assert s["expected_rules"]
        assert s["mitre"]


async def test_list_rules_catalog(client):
    resp = await client.get("/api/v1/lab/rules")
    assert resp.status_code == 200
    rules = resp.json()
    assert len(rules) >= 10
    kinds = {r["kind"] for r in rules}
    assert kinds <= {"sigma", "yara", "correlation"}
    for r in rules:
        assert r["id"] and r["title"] and r["level"]
        assert r["description"]


async def test_get_single_rule(client):
    listing = (await client.get("/api/v1/lab/rules")).json()
    rule_id = listing[0]["id"]
    resp = await client.get(f"/api/v1/lab/rules/{rule_id}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["id"] == rule_id
    assert detail["source"]


async def test_get_unknown_rule_is_404(client):
    resp = await client.get("/api/v1/lab/rules/rule-that-does-not-exist")
    assert resp.status_code == 404
    body = resp.json()
    assert body["error"] == "NOT_FOUND"
    assert body["message"] == "rule-that-does-not-exist"
