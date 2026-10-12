from pydantic import BaseModel, Field


class SiteMonitoringEvent(BaseModel):
    """Evento de segurança do próprio site (dogfooding do motor de detecção).

    ``actor`` é um hash SHA-256 com sal rotativo — nunca um IP real.
    """

    id: str
    timestamp: str
    kind: str = Field(description="auth_burst | temp_ban | route_scan")
    severity: str = "medium"
    count: int = Field(ge=1)
    route: str
    actor: str
    detection: list[str] = Field(default_factory=list)

    model_config = {"json_schema_extra": {
        "example": {
            "id": "site-3",
            "timestamp": "2026-01-10T12:00:00Z",
            "kind": "route_scan",
            "severity": "medium",
            "count": 21,
            "route": "/admin.php",
            "actor": "3f2a9c1b7d5e4f60",
            "detection": ["corr-web-scan-404"],
        }
    }}


class SiteMonitoring(BaseModel):
    events: list[SiteMonitoringEvent] = Field(default_factory=list)
    window_seconds: int = 60
    salt_rotation_hours: int = 24


class UsageMetrics(BaseModel):
    used: int = 0
    total: int = 0
    percentage: float = Field(ge=0, le=100)


class SystemMetricsPayload(BaseModel):
    """Formato consumido pelo gráfico da página ``/status`` do frontend."""

    cpu: float = Field(ge=0, le=100)
    memory: UsageMetrics
    disk: UsageMetrics
    uptime: float = 0.0


class StatusResponse(BaseModel):
    uptime_seconds: float
    cpu_percent: float = Field(ge=0, le=100)
    memory_percent: float = Field(ge=0, le=100)
    disk_percent: float = Field(ge=0, le=100)
    api_latency_ms: float = Field(ge=0)
    database_reachable: bool
    cache_reachable: bool
    # Percentis da janela de latência HTTP (ms) — p50/p95/p99.
    latency_percentiles: dict[str, float] = Field(default_factory=dict)
    # 0 = normal, 1 = laboratório desligado, 2 = degradação crítica.
    degradation_level: int = Field(default=0, ge=0, le=2)
    # "Site sob monitoramento": eventos do próprio site sem dados pessoais.
    site_monitoring: SiteMonitoring = Field(default_factory=SiteMonitoring)
    # Espelhamento no formato que o gráfico do frontend consome.
    metrics: SystemMetricsPayload | None = None

    model_config = {"json_schema_extra": {
        "example": {
            "uptime_seconds": 3600.0,
            "cpu_percent": 12.5,
            "memory_percent": 48.2,
            "disk_percent": 63.1,
            "api_latency_ms": 4.2,
            "database_reachable": True,
            "cache_reachable": True,
            "latency_percentiles": {"p50": 3.1, "p95": 18.4, "p99": 42.0, "count": 1000},
            "degradation_level": 0,
            "site_monitoring": {
                "events": [],
                "window_seconds": 60,
                "salt_rotation_hours": 24,
            },
            "metrics": {
                "cpu": 12.5,
                "memory": {"used": 1024, "total": 4096, "percentage": 48.2},
                "disk": {"used": 1024, "total": 4096, "percentage": 63.1},
                "uptime": 3600.0,
            },
        }
    }}


class HealthResponse(BaseModel):
    status: str

    model_config = {"json_schema_extra": {"example": {"status": "ok"}}}


class ReadinessResponse(BaseModel):
    status: str
    checks: dict[str, str]
    latency_ms: dict[str, float] = Field(default_factory=dict)

    model_config = {"json_schema_extra": {
        "example": {
            "status": "ok",
            "checks": {"database": "ok", "cache": "ok", "disk": "ok"},
            "latency_ms": {"database": 1.2, "cache": 0.4, "disk": 0.1},
        }
    }}
