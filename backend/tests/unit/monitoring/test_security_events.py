"""Eventos de segurança do site: hash de IP, limiares e dogfooding.

Critério de aceitação: o payload de /status expõe o ator (hash com sal
rotativo), nunca o IP real; e um varredor que dispare 20x 404 em 60 s
aciona a pattern ``corr-web-scan-404`` do motor de detecção.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.monitoring import security_events as se

RAW_IP = "203.0.113.77"


class FakeClock:
    """Relógio determinístico para salt/janelas/cooldown sem esperar tempo real."""

    def __init__(self, start: float = 1_000_000.0) -> None:
        self.now = start

    def time(self) -> float:
        return self.now

    def monotonic(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class StubEngine:
    """Motor falso que registra records e devolve alertas programados."""

    def __init__(self, alerts: list | None = None) -> None:
        self.records: list[dict] = []
        self._alerts = alerts or []

    def process(self, record: dict, event_id: str):
        self.records.append(record)
        return SimpleNamespace(alerts=list(self._alerts), event=record)


@pytest.fixture(autouse=True)
def _reset_state():
    se.reset(engine=True)
    yield
    se.reset(engine=True)


@pytest.fixture
def clock(monkeypatch) -> FakeClock:
    fake = FakeClock()
    monkeypatch.setattr(se, "time", fake)
    return fake


def install_stub_engine(monkeypatch, engine_alerts: list | None = None) -> StubEngine:
    stub = StubEngine(engine_alerts)
    monkeypatch.setattr(se, "_engine", stub)
    monkeypatch.setattr(se, "_engine_broken", False)
    return stub


# --------------------------------------------------------------------------- #
# Hash de IP                                                                  #
# --------------------------------------------------------------------------- #


def test_hash_ip_never_exposes_raw_ip():
    digest = se.hash_ip(RAW_IP)
    assert digest != RAW_IP
    assert len(digest) == 16
    assert set(digest) <= set("0123456789abcdef")
    assert se.hash_ip(None) == "unknown"
    assert se.hash_ip("") == "unknown"
    assert se.hash_ip("unknown") == "unknown"


def test_hash_ip_is_stable_within_bucket_and_rotates(clock):
    first = se.hash_ip(RAW_IP)
    assert se.hash_ip(RAW_IP) == first  # mesmo sal na mesma janela
    clock.advance(max(settings.security_hash_rotation_hours, 1) * 3600 + 1)
    assert se.hash_ip(RAW_IP) != first  # sal novo => hash novo


# --------------------------------------------------------------------------- #
# Limiares por ator                                                           #
# --------------------------------------------------------------------------- #


def test_benign_responses_are_ignored(clock):
    assert se.observe(status=200, path="/", ip=RAW_IP) is None
    assert se.recent_events() == []


def test_auth_burst_event_has_hashed_actor_only(clock, monkeypatch):
    install_stub_engine(monkeypatch)
    created = None
    for _ in range(se.AUTH_BURST_THRESHOLD):
        created = se.observe(status=401, path="/api/v1/auth/login", ip=RAW_IP)
    assert created is not None
    assert created["kind"] == "auth_burst"
    assert created["count"] == se.AUTH_BURST_THRESHOLD
    assert created["actor"] == se.hash_ip(RAW_IP)

    events = se.recent_events()
    payload = json.dumps(events)
    assert RAW_IP not in payload
    assert "203.0.113" not in payload


def test_auth_burst_respects_cooldown(clock, monkeypatch):
    install_stub_engine(monkeypatch)
    for _ in range(se.AUTH_BURST_THRESHOLD - 1):
        assert se.observe(status=401, path="/login", ip=RAW_IP) is None
    assert se.observe(status=401, path="/login", ip=RAW_IP) is not None  # 10o: dispara
    for _ in range(se.AUTH_BURST_THRESHOLD):
        assert se.observe(status=401, path="/login", ip=RAW_IP) is None  # cooldown
    clock.advance(se._EMIT_COOLDOWN + 1)
    created = None
    for _ in range(se.AUTH_BURST_THRESHOLD):
        created = se.observe(status=401, path="/login", ip=RAW_IP)
    assert created is not None  # cooldown expirou, novo evento é permitido


def test_temp_ban_after_mass_429(clock, monkeypatch):
    install_stub_engine(monkeypatch)
    created = None
    for _ in range(se.BAN_THRESHOLD):
        created = se.observe(status=429, path="/api/v1/contact", ip=RAW_IP)
    assert created is not None
    assert created["kind"] == "temp_ban"
    assert created["count"] == se.BAN_THRESHOLD


def test_route_scan_needs_distinct_routes(clock, monkeypatch):
    install_stub_engine(monkeypatch)
    created = None
    for index in range(se.SCAN_DISTINCT_ROUTES):
        created = se.observe(status=404, path=f"/rota-{index}", ip=RAW_IP)
    assert created is not None
    assert created["kind"] == "route_scan"
    assert created["count"] == se.SCAN_DISTINCT_ROUTES


def test_route_scan_fires_on_repeated_path(clock, monkeypatch):
    install_stub_engine(monkeypatch)
    created = None
    for _ in range(se.SCAN_TOTAL_ROUTES):
        created = se.observe(status=404, path="/wp-admin.php", ip=RAW_IP)
    assert created is not None
    assert created["kind"] == "route_scan"
    assert created["count"] == se.SCAN_TOTAL_ROUTES


def test_actors_are_isolated(clock, monkeypatch):
    install_stub_engine(monkeypatch)
    for _ in range(se.AUTH_BURST_THRESHOLD - 1):
        assert se.observe(status=401, path="/login", ip=RAW_IP) is None
    # Outro ator não soma na janela do primeiro.
    for _ in range(se.AUTH_BURST_THRESHOLD - 1):
        assert se.observe(status=401, path="/login", ip="198.51.100.9") is None
    # Mas o primeiro completa o próprio limiar.
    created = se.observe(status=401, path="/login", ip=RAW_IP)
    assert created is not None


def test_prune_drops_stale_window_entries(clock, monkeypatch):
    install_stub_engine(monkeypatch)
    for _ in range(se.AUTH_BURST_THRESHOLD - 1):
        assert se.observe(status=401, path="/login", ip=RAW_IP) is None
    assert se.observe(status=401, path="/login", ip=RAW_IP) is not None  # dispara
    # Após a janela, os stamps antigos saem e o limiar recomeça do zero.
    clock.advance(settings.site_event_window_seconds + 1)
    for _ in range(se.AUTH_BURST_THRESHOLD - 1):
        assert se.observe(status=401, path="/login", ip=RAW_IP) is None


# --------------------------------------------------------------------------- #
# Dogfooding do motor de detecção                                             #
# --------------------------------------------------------------------------- #


def test_engine_feed_budget_limits_events_per_minute(clock, monkeypatch):
    monkeypatch.setattr(settings, "engine_feed_per_minute", 5)
    stub = install_stub_engine(monkeypatch)
    for _ in range(10):
        se.observe(status=404, path="/qualquer", ip=RAW_IP)
    assert len(stub.records) == 5  # orçamento esgotado no 5o evento
    # Cada record entregue é sintético e já leva o hash como "ip".
    assert stub.records[0]["category"] == "web"
    assert stub.records[0]["status"] == 404
    assert stub.records[0]["ip"] == se.hash_ip(RAW_IP)


def test_route_scan_event_carries_recent_engine_rules(clock, monkeypatch):
    engine_alert = SimpleNamespace(
        rule_id="corr-web-scan-404", severity="high", title="Directory scan"
    )
    install_stub_engine(monkeypatch, engine_alerts=[engine_alert])
    created = None
    for index in range(se.SCAN_DISTINCT_ROUTES):
        created = se.observe(status=404, path=f"/varredura-{index}", ip=RAW_IP)
    assert created is not None
    assert created["detection"] == ["corr-web-scan-404"]
    assert created["severity"] == "high"  # severidade herdada do motor


def test_real_engine_detects_404_burst(clock):
    """20x 404 na mesma janela => corr-web-scan-404 no motor real."""
    for index in range(se.SCAN_TOTAL_ROUTES + 1):
        se.observe(status=404, path=f"/painel-{index}.php", ip=RAW_IP)

    fired = {item["rule_id"] for item in se._engine_alerts}
    assert "corr-web-scan-404" in fired
    # O evento de varredura do site também aparece (sem IP).
    kinds = {event["kind"] for event in se.recent_events()}
    assert "route_scan" in kinds
    assert RAW_IP not in json.dumps(se.recent_events())


# --------------------------------------------------------------------------- #
# API pública                                                                  #
# --------------------------------------------------------------------------- #


def test_recent_events_returns_copies_and_respects_limit(clock, monkeypatch):
    install_stub_engine(monkeypatch)
    for index in range(se.AUTH_BURST_THRESHOLD):
        se.observe(status=401, path=f"/p{index}", ip=RAW_IP)
    events = se.recent_events(limit=1)
    assert len(events) == 1
    events[0]["kind"] = "manipulado"
    assert se.recent_events()[0]["kind"] == "auth_burst"
    assert se.recent_events(limit=0) == []
