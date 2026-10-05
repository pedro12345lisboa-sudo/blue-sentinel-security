from pydantic import BaseModel, Field


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
