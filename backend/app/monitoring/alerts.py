"""Alertas operacionais: deduplicação, silêncio configurável e notificação.

Fluxo completo (docs/architecture/observability.md):

1. O **Prometheus** avalia ``docker/prometheus/alert.rules.yml`` (backend
   fora do ar, taxa de erro > 5 %, p95 > 1 s, disco > 80 %, certificado
   < 14 dias, fila de e-mail parada, pico de 401/429).
2. O **Alertmanager** despacha para o webhook deste backend
   (``POST /api/v1/alerts/webhook`` com ``ALERT_WEBHOOK_TOKEN``) e,
   opcionalmente, direto por e-mail (assim um alerta de "backend fora do
   ar" chega mesmo com a API caída — ver docker/prometheus/alertmanager.yml).
3. :class:`AlertNotifier` aplica **deduplicação** (o mesmo alerta não é
   reenviado dentro de ``ALERT_DEDUP_SECONDS``), **silêncio** por nome ou
   severidade (``ALERT_SILENCES=DiskHigh,critical``) e entrega em webhook
   (Discord/Telegram) e/ou e-mail — sempre com **link de runbook**.

O backend também avalia os próprios sinais a cada
``ALERT_CHECK_INTERVAL`` segundos (:class:`AlertMonitor`), cobrindo os
casos que não dependem do Prometheus (fila parada, picos de 401/429,
certificado, disco local).
"""

from __future__ import annotations

import asyncio
import logging
import re
import socket
import ssl
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

import httpx

from app.core.config import settings
from app.monitoring import metrics

logger = logging.getLogger(__name__)

SEVERITIES = ("info", "warning", "critical")


# --------------------------------------------------------------------------- #
# Modelo                                                                      #
# --------------------------------------------------------------------------- #


def runbook_anchor(name: str) -> str:
    """``HighErrorRate`` -> ``#high-error-rate`` (âncora no runbook)."""
    kebab = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", name)
    kebab = re.sub(r"[^A-Za-z0-9-]+", "-", kebab)
    return "#" + re.sub(r"-{2,}", "-", kebab).strip("-").lower()


@dataclass(frozen=True)
class Alert:
    name: str
    severity: str = "warning"
    summary: str = ""
    labels: dict[str, str] = field(default_factory=dict)
    runbook: str | None = None
    resolved: bool = False

    @property
    def anchor(self) -> str:
        return runbook_anchor(self.name)

    @property
    def runbook_url(self) -> str:
        base = self.runbook or settings.runbook_url
        return f"{base}{self.anchor}" if not self.resolved else base

    def text(self) -> str:
        lines = [
            f"[{self.severity.upper()}] {self.name}",
            self.summary or self.name,
            f"Runbook: {self.runbook_url}",
        ]
        for key, value in sorted(self.labels.items()):
            lines.append(f"{key}: {value}")
        return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Notificador (dedup + silêncio + canais)                                     #
# --------------------------------------------------------------------------- #


class AlertNotifier:
    """Entrega alertas com deduplicação e silêncio por configuração."""

    def __init__(
        self,
        *,
        webhook_url: str | None = None,
        email_to: str | None = None,
        dedup_seconds: int | None = None,
        silences: set[str] | None = None,
        deliver: Callable[[Alert], Awaitable[None]] | None = None,
        now: Callable[[], float] = time.time,
    ) -> None:
        self.webhook_url = settings.alert_webhook_url if webhook_url is None else webhook_url
        self.email_to = settings.alert_email_to if email_to is None else email_to
        self.dedup_seconds = (
            settings.alert_dedup_seconds if dedup_seconds is None else dedup_seconds
        )
        self.silences = (
            _parse_silences(settings.alert_silences) if silences is None else silences
        )
        self._deliver_override = deliver
        self._now = now
        self._last_sent: dict[str, float] = {}

    def is_silenced(self, alert: Alert) -> bool:
        return alert.name in self.silences or alert.severity in self.silences

    def clear(self, name: str) -> None:
        """Libera a deduplicação (usado quando o alerta é resolvido)."""
        self._last_sent.pop(name, None)

    def suppressed_reason(self, alert: Alert) -> str | None:
        """``None`` quando o alerta deve ser enviado; motivo caso contrário."""
        if alert.resolved:
            return "resolved"
        if self.is_silenced(alert):
            return "silenced"
        last = self._last_sent.get(alert.name)
        if last is not None and (self._now() - last) < self.dedup_seconds:
            return "deduplicated"
        return None

    async def notify(self, alert: Alert) -> bool:
        reason = self.suppressed_reason(alert)
        if reason == "resolved":
            self.clear(alert.name)
            logger.info("Alerta resolvido name=%s", alert.name)
            return False
        if reason is not None:
            logger.info("Alerta suprimido name=%s reason=%s", alert.name, reason)
            return False

        self._last_sent[alert.name] = self._now()
        await self.deliver(alert)
        return True

    async def deliver(self, alert: Alert) -> None:
        """Envia por todos os canais configurados (nunca levanta exceção)."""
        if self._deliver_override is not None:
            await self._deliver_override(alert)
            return

        sent = False
        if self.webhook_url:
            sent = await self._send_webhook(alert) or sent
        if self.email_to:
            sent = await self._send_email(alert) or sent
        if not sent:
            # Sem canal configurado: o alerta vive no log estruturado.
            logger.warning("ALERTA %s", alert.text().replace("\n", " | "))

    async def _send_webhook(self, alert: Alert) -> bool:
        # Discord aceita `content`; bridges de Telegram costumam ler `text`.
        payload = {
            "username": "blue-sentinel",
            "content": alert.text(),
            "text": alert.text(),
            "alert": {
                "name": alert.name,
                "severity": alert.severity,
                "summary": alert.summary,
                "runbook": alert.runbook_url,
                "labels": alert.labels,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(self.webhook_url, json=payload)
                response.raise_for_status()
            logger.info("Alerta enviado por webhook name=%s", alert.name)
            return True
        except Exception:
            logger.warning("Falha ao enviar alerta por webhook name=%s", alert.name, exc_info=True)
            return False

    async def _send_email(self, alert: Alert) -> bool:
        if not settings.smtp_host:
            return False
        try:
            import aiosmtplib
            from email.message import EmailMessage

            message = EmailMessage()
            message["From"] = settings.smtp_from
            message["To"] = self.email_to
            message["Subject"] = f"[Blue-Sentinel][{alert.severity}] {alert.name}"
            message.set_content(alert.text())
            await aiosmtplib.send(
                message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user or None,
                password=settings.smtp_password or None,
                use_tls=settings.smtp_port == 465,
            )
            logger.info("Alerta enviado por e-mail name=%s", alert.name)
            return True
        except Exception:
            logger.warning("Falha ao enviar alerta por e-mail name=%s", alert.name, exc_info=True)
            return False


def _parse_silences(raw: str) -> set[str]:
    return {item.strip() for item in raw.split(",") if item.strip()}


# --------------------------------------------------------------------------- #
# Payload do Alertmanager                                                      #
# --------------------------------------------------------------------------- #


def from_alertmanager(payload: dict[str, Any]) -> list[Alert]:
    """Converte o webhook do Alertmanager em :class:`Alert` do backend."""
    alerts: list[Alert] = []
    for item in payload.get("alerts") or []:
        if not isinstance(item, dict):
            continue
        labels = {str(k): str(v) for k, v in (item.get("labels") or {}).items()}
        annotations = {str(k): str(v) for k, v in (item.get("annotations") or {}).items()}
        name = labels.get("alertname", "UnnamedAlert")
        severity = labels.get("severity", "warning").lower()
        if severity not in SEVERITIES:
            severity = "warning"
        resolved = item.get("status") == "resolved"
        summary = annotations.get("summary") or annotations.get("description") or name
        alerts.append(
            Alert(
                name=name,
                severity=severity,
                summary=summary,
                labels=labels,
                runbook=annotations.get("runbook_url"),
                resolved=resolved,
            )
        )
    return alerts


# --------------------------------------------------------------------------- #
# Janelas deslizantes (auto-checks)                                            #
# --------------------------------------------------------------------------- #


def _value(metric: Any) -> float:
    """Valor atual de Counter/Gauge do prometheus_client (API privada)."""
    try:
        return float(metric._value.get())  # noqa: SLF001
    except Exception:  # pragma: no cover - defensivo
        return 0.0


def _prune(window: deque[float], cutoff: float) -> None:
    while window and window[0] < cutoff:
        window.popleft()


def _prune_requests(window: deque[tuple[float, bool]], cutoff: float) -> None:
    while window and window[0][0] < cutoff:
        window.popleft()


# Estado compartilhado entre middleware e monitor.
_auth_hits: deque[float] = deque()
_rate_hits: deque[float] = deque()
_requests: deque[tuple[float, bool]] = deque()


def record_request(status: int) -> None:
    """Alimenta as janelas usadas pelos alertas de erro e de picos."""
    now = time.monotonic()
    _requests.append((now, status >= 500))
    if status == 401:
        _auth_hits.append(now)
    elif status == 429:
        _rate_hits.append(now)
    cutoff = now - max(settings.error_rate_window_seconds, 60)
    _prune_requests(_requests, cutoff)
    _prune(_auth_hits, now - 60)
    _prune(_rate_hits, now - 60)


def reset_windows() -> None:
    """Zera as janelas (testes)."""
    _auth_hits.clear()
    _rate_hits.clear()
    _requests.clear()


# --------------------------------------------------------------------------- #
# Certificado TLS                                                             #
# --------------------------------------------------------------------------- #


def cert_not_after(host: str, port: int = 443, timeout: float = 5.0) -> datetime | None:
    """Data de expiração do certificado apresentado por ``host:port``."""
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    try:
        with socket.create_connection((host, port), timeout=timeout) as raw:
            with context.wrap_socket(raw, server_hostname=host) as sock:
                der = sock.getpeercert(binary_form=True)
    except OSError:
        return None
    if not der:
        return None
    try:
        from cryptography import x509

        certificate = x509.load_der_x509_certificate(der)
        not_after = getattr(certificate, "not_valid_after_utc", None)
        if not_after is None:  # pragma: no cover - cryptography < 42
            not_after = certificate.not_valid_after.replace(tzinfo=timezone.utc)
        return not_after
    except Exception:  # pragma: no cover - defensivo
        logger.warning("Não foi possível ler o certificado de %s", host, exc_info=True)
        return None


def cert_expiry_days(host: str, port: int = 443) -> float | None:
    """Dias até a expiração do certificado (``None`` quando indisponível)."""
    not_after = cert_not_after(host, port)
    if not_after is None:
        return None
    remaining = (not_after - datetime.now(timezone.utc)).total_seconds()
    return remaining / 86400.0


# --------------------------------------------------------------------------- #
# Auto-checks do backend                                                       #
# --------------------------------------------------------------------------- #


class AlertMonitor:
    """Avalia os sinais locais e notifica (com dedup/silêncio)."""

    def __init__(self, notifier: AlertNotifier) -> None:
        self.notifier = notifier
        self._queue: dict[str, float] | None = None

    async def check_once(self) -> list[Alert]:
        """Roda todos os checks, notifica e devolve os alertas emitidos."""
        candidates = (
            self.check_error_rate()
            + self.check_latency()
            + self.check_disk()
            + self.check_queue_stalled()
            + self.check_auth_spikes()
            + await self.check_certificate()
        )
        emitted: list[Alert] = []
        for alert in candidates:
            if await self.notifier.notify(alert):
                emitted.append(alert)
        return emitted

    # -- taxa de erro --------------------------------------------------------

    def check_error_rate(self) -> list[Alert]:
        window = max(settings.error_rate_window_seconds, 60)
        now = time.monotonic()
        _prune_requests(_requests, now - window)
        total = len(_requests)
        errors = sum(1 for _, failed in _requests if failed)
        if total < 30:
            return []
        ratio = errors / total
        if ratio <= settings.error_rate_threshold:
            return []
        return [
            Alert(
                name="HighErrorRate",
                severity="critical",
                summary=(
                    f"Taxa de erro {ratio:.1%} nos últimos {window // 60} min "
                    f"({errors} de {total} requisições com 5xx)"
                ),
                labels={"window": f"{window}s", "threshold": f"{settings.error_rate_threshold:.0%}"},
            )
        ]

    # -- latência p95 --------------------------------------------------------

    def check_latency(self) -> list[Alert]:
        snapshot = metrics.latency_percentiles()
        if snapshot.get("count", 0) < 30:
            return []
        p95 = snapshot.get("p95", 0.0)
        if p95 <= settings.latency_p95_threshold_ms:
            return []
        return [
            Alert(
                name="HighLatencyP95",
                severity="warning",
                summary=(
                    f"p95 de latência em {p95:.0f} ms "
                    f"(limite {settings.latency_p95_threshold_ms:.0f} ms)"
                ),
                labels={"quantile": "0.95", "value_ms": f"{p95:.0f}"},
            )
        ]

    # -- disco ---------------------------------------------------------------

    def check_disk(self) -> list[Alert]:
        usage = _value(metrics.DISK_PERCENT)
        if usage < settings.disk_alert_threshold:
            return []
        severity = "critical" if usage >= settings.disk_critical_threshold else "warning"
        return [
            Alert(
                name="DiskHigh",
                severity=severity,
                summary=f"Disco em {usage:.1f}% (limite {settings.disk_alert_threshold:.0f}%)",
                labels={"used_percent": f"{usage:.1f}"},
            )
        ]

    # -- fila de e-mail parada ------------------------------------------------

    def check_queue_stalled(self) -> list[Alert]:
        depth = _value(metrics.QUEUE_DEPTH.labels(queue="email"))
        sent = _value(metrics.EMAIL_SENT)
        now = time.time()

        if depth <= 0:
            self._queue = None
            return []
        if self._queue is None or self._queue["depth"] != depth or self._queue["sent"] != sent:
            self._queue = {"depth": depth, "sent": sent, "since": now}
            return []
        if now - self._queue["since"] < settings.queue_stall_seconds:
            return []
        return [
            Alert(
                name="EmailQueueStalled",
                severity="warning",
                summary=(
                    f"Fila de e-mail parada há "
                    f"{int(now - self._queue['since'])} s com {int(depth)} mensagem(ns)"
                ),
                labels={"queue_depth": str(int(depth))},
            )
        ]

    # -- picos de 401/429 -----------------------------------------------------

    def check_auth_spikes(self) -> list[Alert]:
        now = time.monotonic()
        _prune(_auth_hits, now - 60)
        _prune(_rate_hits, now - 60)
        alerts: list[Alert] = []
        if len(_auth_hits) >= settings.auth_failure_spike:
            alerts.append(
                Alert(
                    name="AuthFailureSpike",
                    severity="warning",
                    summary=f"{len(_auth_hits)} respostas 401 no último minuto",
                    labels={"window": "60s", "count": str(len(_auth_hits))},
                )
            )
        if len(_rate_hits) >= settings.rate_limit_spike:
            alerts.append(
                Alert(
                    name="RateLimitSpike",
                    severity="warning",
                    summary=f"{len(_rate_hits)} respostas 429 no último minuto",
                    labels={"window": "60s", "count": str(len(_rate_hits))},
                )
            )
        return alerts

    # -- certificado ----------------------------------------------------------

    async def check_certificate(self) -> list[Alert]:
        host = settings.cert_check_host
        if not host:
            return []
        days = await asyncio.to_thread(cert_expiry_days, host, settings.cert_check_port)
        if days is None or days > settings.cert_warn_days:
            return []
        severity = "critical" if days <= 7 else "warning"
        return [
            Alert(
                name="CertExpiringSoon",
                severity=severity,
                summary=(
                    f"Certificado de {host} expira em {max(days, 0):.1f} dias "
                    f"(aviso com {settings.cert_warn_days} dias)"
                ),
                labels={"host": host, "days": f"{days:.1f}"},
            )
        ]


# --------------------------------------------------------------------------- #
# Ciclo de vida                                                                #
# --------------------------------------------------------------------------- #

notifier = AlertNotifier()
monitor = AlertMonitor(notifier)

_task: asyncio.Task | None = None
_stop: asyncio.Event | None = None


async def _run(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await monitor.check_once()
        except Exception:  # pragma: no cover - defensivo
            logger.warning("Falha na rodada de alertas", exc_info=True)
        try:
            await asyncio.wait_for(stop.wait(), timeout=max(settings.alert_check_interval, 10))
        except asyncio.TimeoutError:
            continue


def start_monitor() -> None:
    """Inicia os auto-checks de alerta (chamado no lifespan do app)."""
    global _task, _stop
    if _task is None or _task.done():
        _stop = asyncio.Event()
        _task = asyncio.create_task(_run(_stop))


async def stop_monitor() -> None:
    """Para os auto-checks de forma graciosa."""
    global _task, _stop
    if _stop is not None:
        _stop.set()
    if _task is not None:
        try:
            await _task
        except asyncio.CancelledError:
            pass
        except Exception:  # pragma: no cover - defensivo
            logger.warning("Monitor de alertas terminou com erro", exc_info=True)
    _task = None
    _stop = None
