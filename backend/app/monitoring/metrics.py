"""Métricas Prometheus + janela de latência (p50/p95/p99) para ``/status``.

O endpoint ``/metrics`` é servido por :mod:`app.api.v1.metrics` e exige token
(``METRICS_TOKEN``) — nada aqui é exposto sem autenticação.
"""

from __future__ import annotations

import math
import threading
from collections import deque

from prometheus_client import (
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

REGISTRY = CollectorRegistry(auto_describe=True)

# ---------------------------------------------------------------- HTTP
HTTP_REQUESTS = Counter(
    "bs_http_requests_total",
    "Requisições HTTP processadas",
    ["method", "path", "status"],
    registry=REGISTRY,
)
HTTP_LATENCY = Histogram(
    "bs_http_request_duration_seconds",
    "Latência HTTP (segundos)",
    ["method", "path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
    registry=REGISTRY,
)

# ------------------------------------------------------------- recursos
CPU_PERCENT = Gauge(
    "bs_cpu_percent", "Uso de CPU (%)", registry=REGISTRY
)
MEMORY_PERCENT = Gauge(
    "bs_memory_percent", "Uso de memória (%)", registry=REGISTRY
)
DISK_PERCENT = Gauge(
    "bs_disk_percent", "Uso de disco (%)", registry=REGISTRY
)
PROCESS_RSS_BYTES = Gauge(
    "bs_process_resident_memory_bytes", "RSS do processo (bytes)", registry=REGISTRY
)
DISK_ALERT = Gauge(
    "bs_disk_alert",
    "1 quando o disco passou do limite de alerta (80%)",
    registry=REGISTRY,
)
DEGRADATION_LEVEL = Gauge(
    "bs_degradation_level",
    "0 = normal, 1 = laboratório desligado, 2 = degradação crítica",
    registry=REGISTRY,
)

# ------------------------------------------------------- dependências
POSTGRES_UP = Gauge("bs_postgres_up", "1 se o Postgres responde", registry=REGISTRY)
REDIS_UP = Gauge("bs_redis_up", "1 se o Redis responde", registry=REGISTRY)

# -------------------------------------------------------------- cache
CACHE_HITS = Counter(
    "bs_cache_hits_total", "Acertos de cache", ["namespace"], registry=REGISTRY
)
CACHE_MISSES = Counter(
    "bs_cache_misses_total", "Falhas de cache", ["namespace"], registry=REGISTRY
)
CACHE_STALE_SERVED = Counter(
    "bs_cache_stale_total",
    "Valores stale servidos quando a fonte falhou",
    ["namespace"],
    registry=REGISTRY,
)

# --------------------------------------------------------- workers/filas
QUEUE_DEPTH = Gauge(
    "bs_queue_depth", "Mensagens pendentes na fila", ["queue"], registry=REGISTRY
)
EMAIL_SENT = Counter("bs_email_sent_total", "E-mails entregues", registry=REGISTRY)
EMAIL_FAILED = Counter("bs_email_failed_total", "Falhas de envio de e-mail", registry=REGISTRY)
EMAIL_DEAD_LETTER = Counter(
    "bs_email_dead_letter_total", "Jobs movidos para a dead-letter", registry=REGISTRY
)
CLEANUP_REMOVED = Counter(
    "bs_cleanup_removed_total", "Registros removidos pela limpeza", ["kind"], registry=REGISTRY
)

_MAX_UNIQUE_PATHS = 200
_SEEN_PATHS: set[str] = set()
_SEEN_LOCK = threading.Lock()


def normalize_path(path: str) -> str:
    """Reduz a cardinalidade de labels: ids dinâmicos viram ``:id``."""
    parts = [p for p in path.split("/") if p]
    normalized: list[str] = []
    for part in parts:
        if part.isdigit() or (len(part) >= 32 and all(c in "0123456789abcdef-" for c in part)):
            normalized.append(":id")
        else:
            normalized.append(part)
    candidate = "/" + "/".join(normalized)
    with _SEEN_LOCK:
        if candidate in _SEEN_PATHS:
            return candidate
        if len(_SEEN_PATHS) >= _MAX_UNIQUE_PATHS:
            return "other"
        _SEEN_PATHS.add(candidate)
    return candidate


def observe_request(method: str, path: str, status: int, duration_seconds: float) -> None:
    """Registra uma requisição (contador + histograma + janela de latência)."""
    label = normalize_path(path)
    HTTP_REQUESTS.labels(method=method, path=label, status=str(status)).inc()
    HTTP_LATENCY.labels(method=method, path=label).observe(duration_seconds)
    LATENCY_WINDOW.observe(duration_seconds)


class LatencyWindow:
    """Janela deslizante de latências (ms) com percentis p50/p95/p99."""

    def __init__(self, maxlen: int = 1000) -> None:
        self._samples: deque[float] = deque(maxlen=maxlen)
        self._lock = threading.Lock()

    def observe(self, duration_seconds: float) -> None:
        self.observe_ms(duration_seconds * 1000.0)

    def observe_ms(self, duration_ms: float) -> None:
        with self._lock:
            self._samples.append(duration_ms)

    def snapshot(self) -> dict[str, float]:
        with self._lock:
            data = sorted(self._samples)
        if not data:
            return {"p50": 0.0, "p95": 0.0, "p99": 0.0, "count": 0}
        return {
            "p50": round(_percentile(data, 0.50), 2),
            "p95": round(_percentile(data, 0.95), 2),
            "p99": round(_percentile(data, 0.99), 2),
            "count": len(data),
        }

    def clear(self) -> None:
        with self._lock:
            self._samples.clear()


def _percentile(sorted_data: list[float], quantile: float) -> float:
    """Percentil por interpolação linear (sem numpy)."""
    if not sorted_data:
        return 0.0
    if len(sorted_data) == 1:
        return sorted_data[0]
    position = quantile * (len(sorted_data) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_data[int(position)]
    weight = position - lower
    return sorted_data[lower] * (1 - weight) + sorted_data[upper] * weight


LATENCY_WINDOW = LatencyWindow()


def latency_percentiles() -> dict[str, float]:
    return LATENCY_WINDOW.snapshot()


def render() -> bytes:
    """Snapshot em formato Prometheus text exposition."""
    return generate_latest(REGISTRY)
