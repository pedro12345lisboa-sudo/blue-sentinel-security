"""Regras Prometheus: cobertura dos alertas críticos + link de runbook.

Guard de regressão do contrato ``docker/prometheus/alert.rules.yml``: se
alguém remover um alerta ou tirar o ``for`` do BackendDown, o critério de
aceitação "derrubar o backend alerta em < 2 minutos" quebra silenciosamente.
"""

from __future__ import annotations

import pathlib
import re
from functools import lru_cache

import yaml

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
RULES_FILE = REPO_ROOT / "docker" / "prometheus" / "alert.rules.yml"
PROM_FILE = REPO_ROOT / "docker" / "prometheus" / "prometheus.yml"

REQUIRED_ALERTS = {
    "BackendDown",
    "HighErrorRate",
    "HighLatencyP95",
    "DiskHigh",
    "EmailQueueStalled",
    "AuthFailureSpike",
    "RateLimitSpike",
    "CertExpiringSoon",
}

DURATION_RE = re.compile(r"^(\d+)(s|m|h)$")
_UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600}


def _parse_duration(value: str) -> int:
    match = DURATION_RE.match(str(value))
    assert match, f"duração inválida no alert.rules.yml: {value!r}"
    return int(match.group(1)) * _UNIT_SECONDS[match.group(2)]


@lru_cache(maxsize=1)
def _rules_document() -> dict:
    return yaml.safe_load(RULES_FILE.read_text(encoding="utf-8"))


def _all_alerts() -> list[dict]:
    alerts: list[dict] = []
    for group in _rules_document()["groups"]:
        alerts.extend(group["rules"])
    return alerts


def _alert(name: str) -> dict:
    for alert in _all_alerts():
        if alert["alert"] == name:
            return alert
    raise AssertionError(f"alerta {name} ausente de alert.rules.yml")


def test_every_required_alert_is_declared():
    names = {alert["alert"] for alert in _all_alerts()}
    assert REQUIRED_ALERTS <= names


def test_backend_down_fires_within_two_minutes():
    """scrape 15s + for 1m => alerta em no máximo ~75s (< 2 min)."""
    alert = _alert("BackendDown")
    assert _parse_duration(alert["for"]) <= 60
    assert 'up{job="backend"} == 0' in alert["expr"]


def test_high_error_rate_threshold_and_window():
    alert = _alert("HighErrorRate")
    assert "> 0.05" in alert["expr"]
    assert alert["expr"].count("[5m]") == 2  # janelas de erro e de total
    assert _parse_duration(alert["for"]) == 300


def test_high_latency_p95_threshold():
    alert = _alert("HighLatencyP95")
    assert "histogram_quantile" in alert["expr"]
    assert "> 1" in alert["expr"]  # p95 > 1s


def test_disk_alert_thresholds():
    assert "bs_disk_percent > 80" in _alert("DiskHigh")["expr"]
    assert "bs_disk_percent > 90" in _alert("DiskCritical")["expr"]


def test_certificate_expiry_thresholds():
    assert "14 * 24 * 3600" in _alert("CertExpiringSoon")["expr"]
    assert "7 * 24 * 3600" in _alert("CertExpiringCritical")["expr"]


def test_security_spikes_cover_401_and_429():
    assert "bs_auth_failures_total" in _alert("AuthFailureSpike")["expr"]
    assert "bs_rate_limited_total" in _alert("RateLimitSpike")["expr"]


def test_every_alert_has_severity_and_runbook_url():
    for alert in _all_alerts():
        assert alert["labels"]["severity"] in {"warning", "critical"}, alert["alert"]
        runbook = alert["annotations"].get("runbook_url", "")
        assert runbook.startswith("https://"), alert["alert"]
        assert "#runbook.md#" not in runbook  # âncora kebab-case anexada


def test_scrape_config_protects_metrics_and_probes_backend():
    document = yaml.safe_load(PROM_FILE.read_text(encoding="utf-8"))
    jobs = {job["job_name"]: job for job in document["scrape_configs"]}
    assert set(jobs) >= {"backend", "blackbox-http", "blackbox-tls", "alertmanager"}
    backend = jobs["backend"]
    assert backend["metrics_path"] == "/api/v1/metrics"
    assert backend["authorization"]["credentials_file"] == "/etc/prometheus/metrics_token"
    assert "alertmanager:9093" in str(document["alerting"])
