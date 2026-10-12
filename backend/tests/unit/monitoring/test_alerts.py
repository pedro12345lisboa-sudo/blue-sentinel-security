"""AlertNotifier (dedup + silêncio + runbook) e AlertMonitor (auto-checks)."""

from __future__ import annotations

import asyncio
import time as real_time
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.monitoring import alerts, metrics


def collector(sink: list) -> object:
    """Função assíncrona que captura alertas entregues (usada como canal)."""

    async def _deliver(alert):
        sink.append(alert)

    return _deliver


def make_alert(
    name: str = "DiskHigh",
    severity: str = "warning",
    *,
    resolved: bool = False,
    runbook: str | None = None,
) -> alerts.Alert:
    return alerts.Alert(
        name=name,
        severity=severity,
        summary=f"{name} em teste",
        labels={"used_percent": "85.0"},
        runbook=runbook,
        resolved=resolved,
    )


@pytest.fixture(autouse=True)
def _clean_state():
    alerts.reset_windows()
    metrics.LATENCY_WINDOW.clear()
    metrics.DISK_PERCENT.set(0)
    metrics.QUEUE_DEPTH.labels(queue="email").set(0)
    yield
    alerts.reset_windows()
    metrics.LATENCY_WINDOW.clear()
    metrics.DISK_PERCENT.set(0)
    metrics.QUEUE_DEPTH.labels(queue="email").set(0)


# --------------------------------------------------------------------------- #
# Modelo                                                                      #
# --------------------------------------------------------------------------- #


def test_runbook_anchor_is_kebab_case():
    assert alerts.runbook_anchor("HighErrorRate") == "#high-error-rate"
    assert alerts.runbook_anchor("BackendDown") == "#backend-down"
    assert alerts.runbook_anchor("CertExpiringSoon") == "#cert-expiring-soon"


def test_alert_text_includes_runbook_link():
    text = make_alert().text()
    assert "[WARNING] DiskHigh" in text
    assert "Runbook: " in text
    assert text.splitlines()[2].endswith("#disk-high")


def test_alert_runbook_url_appends_anchor_unless_resolved():
    alert = make_alert(runbook="https://exemplo.local/runbook.md")
    assert alert.runbook_url == "https://exemplo.local/runbook.md#disk-high"
    resolved = make_alert(resolved=True, runbook="https://exemplo.local/runbook.md")
    assert resolved.runbook_url == "https://exemplo.local/runbook.md"


def test_parse_silences_ignores_blanks():
    assert alerts._parse_silences(" DiskHigh , critical ,") == {"DiskHigh", "critical"}
    assert alerts._parse_silences("") == set()


# --------------------------------------------------------------------------- #
# Notificador                                                                 #
# --------------------------------------------------------------------------- #


async def test_notify_delivers_and_deduplicates():
    clock = {"now": 1_000.0}
    delivered: list = []
    notifier = alerts.AlertNotifier(
        webhook_url="",
        email_to="",
        dedup_seconds=300,
        silences=set(),
        deliver=collector(delivered),
        now=lambda: clock["now"],
    )
    alert = make_alert()
    assert await notifier.notify(alert) is True
    assert await notifier.notify(alert) is False
    assert notifier.suppressed_reason(make_alert()) == "deduplicated"
    clock["now"] += 301
    assert await notifier.notify(make_alert()) is True
    assert len(delivered) == 2


async def test_notify_respects_silence_by_name_and_severity():
    delivered: list = []
    by_name = alerts.AlertNotifier(silences={"DiskHigh"}, deliver=collector(delivered))
    by_severity = alerts.AlertNotifier(silences={"critical"}, deliver=collector(delivered))
    assert await by_name.notify(make_alert()) is False
    assert by_name.suppressed_reason(make_alert()) == "silenced"
    assert await by_severity.notify(make_alert(severity="critical")) is False
    # Alerta que não está silenciado continua sendo entregue.
    assert await by_severity.notify(make_alert(name="HighErrorRate")) is True
    assert [a.name for a in delivered] == ["HighErrorRate"]


async def test_resolved_alert_clears_dedup_and_is_not_sent():
    clock = {"now": 100.0}
    delivered: list = []
    notifier = alerts.AlertNotifier(
        dedup_seconds=300, silences=set(), deliver=collector(delivered), now=lambda: clock["now"]
    )
    assert await notifier.notify(make_alert()) is True
    assert await notifier.notify(make_alert(resolved=True)) is False
    # Após o resolve o nome volta a poder ser notificado imediatamente.
    assert await notifier.notify(make_alert()) is True
    assert len(delivered) == 2


def test_from_alertmanager_parses_labels_annotations_and_status():
    payload = {
        "alerts": [
            {
                "labels": {"alertname": "HighErrorRate", "severity": "critical"},
                "annotations": {
                    "summary": "Mais de 5% de erros",
                    "runbook_url": "https://rb.local/runbook.md#high-error-rate",
                },
                "status": "firing",
            },
            {
                "labels": {"alertname": "DiskHigh", "severity": "weird"},
                "annotations": {},
                "status": "resolved",
            },
            "not-a-dict",
        ]
    }
    parsed = alerts.from_alertmanager(payload)
    assert [a.name for a in parsed] == ["HighErrorRate", "DiskHigh"]
    first, second = parsed
    assert first.severity == "critical"
    assert first.summary == "Mais de 5% de erros"
    assert first.runbook == "https://rb.local/runbook.md#high-error-rate"
    assert first.resolved is False
    assert second.severity == "warning"  # severidade desconhecida cai no padrão
    assert second.summary == "DiskHigh"  # sem annotations, usa o nome
    assert second.resolved is True


def test_from_alertmanager_ignores_empty_payload():
    assert alerts.from_alertmanager({}) == []
    assert alerts.from_alertmanager({"alerts": None}) == []


# --------------------------------------------------------------------------- #
# Auto-checks                                                                 #
# --------------------------------------------------------------------------- #


def test_check_error_rate_fires_above_threshold():
    now = real_time.monotonic()
    for index in range(40):
        alerts._requests.append((now, index < 12))  # 30% de 5xx > 5%
    out = alerts.AlertMonitor(alerts.AlertNotifier(deliver=collector([]))).check_error_rate()
    assert [a.name for a in out] == ["HighErrorRate"]
    assert out[0].severity == "critical"


def test_check_error_rate_ignores_small_or_healthy_windows():
    monitor = alerts.AlertMonitor(alerts.AlertNotifier(deliver=collector([])))
    assert monitor.check_error_rate() == []  # menos de 30 amostras
    now = real_time.monotonic()
    for _ in range(30):
        alerts._requests.append((now, False))
    assert monitor.check_error_rate() == []  # 0% de erro


def test_check_latency_fires_when_p95_exceeds_threshold():
    monitor = alerts.AlertMonitor(alerts.AlertNotifier(deliver=collector([])))
    for _ in range(35):
        metrics.LATENCY_WINDOW.observe_ms(settings.latency_p95_threshold_ms + 500)
    out = monitor.check_latency()
    assert [a.name for a in out] == ["HighLatencyP95"]
    metrics.LATENCY_WINDOW.clear()
    for _ in range(35):
        metrics.LATENCY_WINDOW.observe_ms(5.0)
    assert monitor.check_latency() == []


def test_check_disk_warning_and_critical():
    monitor = alerts.AlertMonitor(alerts.AlertNotifier(deliver=collector([])))
    metrics.DISK_PERCENT.set(settings.disk_alert_threshold + 5)
    out = monitor.check_disk()
    assert [a.name for a in out] == ["DiskHigh"]
    assert out[0].severity == "warning"
    metrics.DISK_PERCENT.set(settings.disk_critical_threshold + 5)
    out = monitor.check_disk()
    assert out[0].severity == "critical"
    metrics.DISK_PERCENT.set(10)
    assert monitor.check_disk() == []


def test_check_queue_stalled_after_grace_period(monkeypatch):
    fake_now = {"t": 1_000_000.0}
    monkeypatch.setattr(
        alerts,
        "time",
        SimpleNamespace(time=lambda: fake_now["t"], monotonic=real_time.monotonic),
    )
    metrics.QUEUE_DEPTH.labels(queue="email").set(3)
    monitor = alerts.AlertMonitor(alerts.AlertNotifier(deliver=collector([])))
    assert monitor.check_queue_stalled() == []  # primeira amostra só armazena
    assert monitor.check_queue_stalled() == []  # ainda dentro da janela
    fake_now["t"] += settings.queue_stall_seconds + 1
    out = monitor.check_queue_stalled()
    assert [a.name for a in out] == ["EmailQueueStalled"]
    # Fila esvaziou -> estado é liberado.
    metrics.QUEUE_DEPTH.labels(queue="email").set(0)
    assert monitor.check_queue_stalled() == []


def test_check_auth_spikes_counts_401_and_429():
    monitor = alerts.AlertMonitor(alerts.AlertNotifier(deliver=collector([])))
    now = real_time.monotonic()
    for _ in range(settings.auth_failure_spike):
        alerts._auth_hits.append(now)
    for _ in range(settings.rate_limit_spike):
        alerts._rate_hits.append(now)
    out = monitor.check_auth_spikes()
    assert sorted(a.name for a in out) == ["AuthFailureSpike", "RateLimitSpike"]


async def test_check_certificate_warns_and_goes_critical(monkeypatch):
    monkeypatch.setattr(settings, "cert_check_host", "example.com")
    monitor = alerts.AlertMonitor(alerts.AlertNotifier(deliver=collector([])))

    monkeypatch.setattr(alerts, "cert_expiry_days", lambda host, port=443: 10.0)
    out = await monitor.check_certificate()
    assert [a.name for a in out] == ["CertExpiringSoon"]
    assert out[0].severity == "warning"

    monkeypatch.setattr(alerts, "cert_expiry_days", lambda host, port=443: 3.0)
    out = await monitor.check_certificate()
    assert out[0].severity == "critical"

    monkeypatch.setattr(alerts, "cert_expiry_days", lambda host, port=443: 30.0)
    assert await monitor.check_certificate() == []

    monkeypatch.setattr(alerts, "cert_expiry_days", lambda host, port=443: None)
    assert await monitor.check_certificate() == []


async def test_check_certificate_disabled_without_host(monkeypatch):
    monkeypatch.setattr(settings, "cert_check_host", "")
    monitor = alerts.AlertMonitor(alerts.AlertNotifier(deliver=collector([])))
    assert await monitor.check_certificate() == []


def test_cert_expiry_days_unreachable_host_returns_none():
    # Porta fechada em localhost: recusa de conexão imediata, sem rede externa.
    assert alerts.cert_expiry_days("127.0.0.1", port=1) is None


async def test_check_once_notifies_and_deduplicates():
    delivered: list = []
    notifier = alerts.AlertNotifier(dedup_seconds=300, silences=set(), deliver=collector(delivered))
    monitor = alerts.AlertMonitor(notifier)
    metrics.DISK_PERCENT.set(settings.disk_alert_threshold + 5)
    emitted = await monitor.check_once()
    assert [a.name for a in emitted] == ["DiskHigh"]
    assert await monitor.check_once() == []  # deduplicado no intervalo
    assert len(delivered) == 1


async def test_monitor_lifecycle_start_stop():
    alerts.start_monitor()
    alerts.start_monitor()  # idempotente
    await asyncio.sleep(0.05)  # deixa uma rodada rodar
    await alerts.stop_monitor()
