"""Dogfooding de segurança: o site monitora a si mesmo.

Requisito (docs/architecture/observability.md): rajadas de 401, banimento
temporário (429 em massa) e varredura de rotas (404) do **próprio site**
viram eventos do motor de detecção e aparecem na seção "Site sob
monitoramento" da página ``/status`` — **sem** expor IPs reais.

Privacidade:

* o IP nunca é guardado: só o ``hash_ip`` (SHA-256 com sal que rotaciona a
  cada ``SECURITY_HASH_ROTATION_HOURS``, truncado em 16 hex) — o mesmo
  endereço vira hashes diferentes de um dia para o outro, então nem a
  própria aplicação consegue correlacionar visitantes além da janela;
* nenhum registro é persistido no banco: estado em memória, TTL curto e
  payload público já sanitizado.

Dogfooding real: cada 404/401/429 também é entregue ao
:class:`~app.detection.engine.DetectionEngine` (Sigma + correlação). Um
varredor de diretórios que dispare 20× 404 em 60 s aciona a pattern
``corr-web-scan-404`` do repositório de regras — o mesmo motor do lab.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

SITE_HOST = "blue-sentinel-site"

# Limiares dentro da janela deslizante (settings.site_event_window_seconds).
AUTH_BURST_THRESHOLD = 10       # respostas 401/403 do mesmo ator
BAN_THRESHOLD = 25              # respostas 429 do mesmo ator -> banimento temporário
SCAN_DISTINCT_ROUTES = 15       # rotas 404 distintas do mesmo ator
SCAN_TOTAL_ROUTES = 20          # ou 20× 404 no total (mesma janela)

_EVENTS_MAX = 50
_ENGINE_ALERTS_MAX = 30
_EMIT_COOLDOWN = 60.0           # no máximo 1 evento de cada tipo por ator/minuto

_lock = threading.Lock()
_actor_windows: dict[str, "_ActorWindow"] = {}
_events: deque[dict[str, Any]] = deque(maxlen=_EVENTS_MAX)
_engine_alerts: deque[dict[str, Any]] = deque(maxlen=_ENGINE_ALERTS_MAX)
_feed_stamps: deque[float] = deque()
_event_seq = 0
_engine: Any = None
_engine_broken = False


# --------------------------------------------------------------------------- #
# IP -> hash com sal rotativo                                                  #
# --------------------------------------------------------------------------- #


def current_salt() -> str:
    """Sal que rotaciona a cada ``SECURITY_HASH_ROTATION_HOURS`` horas."""
    rotation = max(settings.security_hash_rotation_hours, 1) * 3600
    bucket = int(time.time() // rotation)
    material = f"{settings.secret_key}:site-ip-salt:{bucket}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def hash_ip(ip: str | None) -> str:
    """Hash irreversível do IP com sal rotativo (16 hex). Nunca o IP cru."""
    if not ip or ip in {"unknown", ""}:
        return "unknown"
    digest = hashlib.sha256(f"{current_salt()}:{ip}".encode("utf-8")).hexdigest()
    return digest[:16]


# --------------------------------------------------------------------------- #
# Estado por ator (janela deslizante)                                          #
# --------------------------------------------------------------------------- #


@dataclass
class _ActorWindow:
    auth_hits: deque[float] = field(default_factory=deque)
    rate_hits: deque[float] = field(default_factory=deque)
    not_found: dict[str, deque[float]] = field(default_factory=dict)
    last_emit: dict[str, float] = field(default_factory=dict)

    def prune(self, now: float, window: float) -> None:
        cutoff = now - window
        while self.auth_hits and self.auth_hits[0] < cutoff:
            self.auth_hits.popleft()
        while self.rate_hits and self.rate_hits[0] < cutoff:
            self.rate_hits.popleft()
        for route in list(self.not_found):
            stamps = self.not_found[route]
            while stamps and stamps[0] < cutoff:
                stamps.popleft()
            if not stamps:
                del self.not_found[route]
        for kind in [k for k, ts in self.last_emit.items() if ts < cutoff]:
            del self.last_emit[kind]


def _window() -> float:
    return float(settings.site_event_window_seconds)


# --------------------------------------------------------------------------- #
# Motor de detecção (lazy)                                                     #
# --------------------------------------------------------------------------- #


def _get_engine() -> Any:
    global _engine, _engine_broken
    if _engine_broken:
        return None
    if _engine is None:
        try:
            from app.detection.engine import DetectionEngine

            _engine = DetectionEngine()
        except Exception:
            _engine_broken = True
            logger.warning("Motor de detecção indisponível para dogfooding", exc_info=True)
            return None
    return _engine


def _engine_budget_ok() -> bool:
    """No máximo ``engine_feed_per_minute`` eventos/minuto para o motor."""
    now = time.monotonic()
    while _feed_stamps and _feed_stamps[0] < now - 60:
        _feed_stamps.popleft()
    if len(_feed_stamps) >= max(settings.engine_feed_per_minute, 1):
        return False
    _feed_stamps.append(now)
    return True


def _feed_engine(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Entrega um evento sintético ao motor; devolve os alertas gerados."""
    engine = _get_engine()
    if engine is None or not _engine_budget_ok():
        return []
    global _event_seq
    try:
        result = engine.process(record, f"site-{_event_seq}")
    except Exception:  # pragma: no cover - o site nunca pode cair por causa do lab
        logger.warning("Falha ao processar evento do site no motor", exc_info=True)
        return []
    emitted = [
        {
            "rule_id": alert.rule_id,
            "severity": alert.severity,
            "title": alert.title,
            "timestamp": record["timestamp"],
        }
        for alert in result.alerts
    ]
    for item in emitted:
        _engine_alerts.append(item)
    return emitted


# --------------------------------------------------------------------------- #
# Detecção de padrões hostis                                                  #
# --------------------------------------------------------------------------- #

_KIND_DEFAULT_SEVERITY = {
    "auth_burst": "medium",
    "temp_ban": "medium",
    "route_scan": "medium",
}


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _max_severity(items: list[dict[str, Any]], fallback: str) -> str:
    order = ["low", "medium", "high", "critical"]
    best = fallback
    for item in items:
        severity = str(item.get("severity", "low")).lower()
        if severity in order and order.index(severity) > order.index(best):
            best = severity
    return best


def _record_event(
    kind: str,
    *,
    actor: str,
    route: str,
    count: int,
    detection: list[dict[str, Any]],
) -> dict[str, Any]:
    global _event_seq
    _event_seq += 1
    recent_rules: list[str] = []
    for alert in reversed(_engine_alerts):
        if alert["rule_id"] not in recent_rules:
            recent_rules.append(alert["rule_id"])
        if len(recent_rules) >= 5:
            break
    event = {
        "id": f"site-{_event_seq}",
        "timestamp": _iso_now(),
        "kind": kind,
        "severity": _max_severity(detection, _KIND_DEFAULT_SEVERITY[kind]),
        "count": count,
        "route": route,
        "actor": actor,
        "detection": recent_rules,
    }
    _events.appendleft(event)
    logger.warning(
        "Evento de segurança do site kind=%s count=%s route=%s actor=%s detection=%s",
        kind,
        count,
        route,
        actor,
        ",".join(recent_rules) or "-",
    )
    return event


def observe(
    status: int,
    path: str,
    ip: str | None,
    method: str = "GET",
    user_agent: str | None = None,
) -> dict[str, Any] | None:
    """Avalia uma resposta HTTP do site e, se for hostil, gera um evento.

    Chamado pelo :class:`RequestContextMiddleware`. Retorna o evento criado
    (ou ``None`` quando nada cruzou o limiar). O IP real nunca sai daqui.
    """
    if status not in (401, 403, 404, 429):
        return None

    actor = hash_ip(ip)
    now = time.monotonic()
    window = _window()

    # Alimenta o motor de detecção (orçamento limitado por minuto).
    detection: list[dict[str, Any]] = []
    if actor != "unknown":
        detection = _feed_engine(
            {
                "timestamp": _iso_now(),
                "category": "web",
                "action": "http_request",
                "status": status,
                "host": SITE_HOST,
                "user": "-",
                "ip": actor,
                "product": "blue-sentinel",
                "process": "gateway",
                "method": method,
                "path": path,
                "url": path,
                "user_agent": user_agent or "-",
                "event_id": f"http-{status}",
                "message": f"{method} {path} responded {status}",
            }
        )

    with _lock:
        win = _actor_windows.setdefault(actor, _ActorWindow())
        win.prune(now, window)

        created: dict[str, Any] | None = None
        if status in (401, 403):
            win.auth_hits.append(now)
            if (
                len(win.auth_hits) >= AUTH_BURST_THRESHOLD
                and now - win.last_emit.get("auth_burst", -_EMIT_COOLDOWN) >= _EMIT_COOLDOWN
            ):
                win.last_emit["auth_burst"] = now
                created = _record_event(
                    "auth_burst",
                    actor=actor,
                    route=path,
                    count=len(win.auth_hits),
                    detection=detection,
                )
        elif status == 429:
            win.rate_hits.append(now)
            if (
                len(win.rate_hits) >= BAN_THRESHOLD
                and now - win.last_emit.get("temp_ban", -_EMIT_COOLDOWN) >= _EMIT_COOLDOWN
            ):
                win.last_emit["temp_ban"] = now
                created = _record_event(
                    "temp_ban",
                    actor=actor,
                    route=path,
                    count=len(win.rate_hits),
                    detection=detection,
                )
        elif status == 404:
            stamps = win.not_found.setdefault(path, deque())
            stamps.append(now)
            distinct = len(win.not_found)
            total = sum(len(items) for items in win.not_found.values())
            if (
                distinct >= SCAN_DISTINCT_ROUTES or total >= SCAN_TOTAL_ROUTES
            ) and now - win.last_emit.get("route_scan", -_EMIT_COOLDOWN) >= _EMIT_COOLDOWN:
                win.last_emit["route_scan"] = now
                created = _record_event(
                    "route_scan",
                    actor=actor,
                    route=path,
                    count=total,
                    detection=detection,
                )

        # Estado nunca fica para sempre na memória.
        if len(_actor_windows) > 1024:
            stale = [
                key
                for key, w in _actor_windows.items()
                if not w.auth_hits and not w.rate_hits and not w.not_found
            ]
            for key in stale[:512]:
                _actor_windows.pop(key, None)

    return created


# --------------------------------------------------------------------------- #
# API pública                                                                  #
# --------------------------------------------------------------------------- #


def recent_events(limit: int = 20) -> list[dict[str, Any]]:
    """Eventos recentes prontos para o payload público de ``/status``."""
    with _lock:
        return [dict(event) for event in list(_events)[: max(limit, 0)]]


def reset(*, engine: bool = False) -> None:
    """Zera o estado (usado pelos testes)."""
    global _event_seq, _engine, _engine_broken
    with _lock:
        _actor_windows.clear()
        _events.clear()
        _engine_alerts.clear()
        _feed_stamps.clear()
        _event_seq = 0
        if engine:
            _engine = None
            _engine_broken = False
