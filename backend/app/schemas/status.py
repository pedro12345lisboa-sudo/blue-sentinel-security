from pydantic import BaseModel, Field


class StatusResponse(BaseModel):
    uptime_seconds: float
    cpu_percent: float = Field(ge=0, le=100)
    memory_percent: float = Field(ge=0, le=100)
    disk_percent: float = Field(ge=0, le=100)
    api_latency_ms: float = Field(ge=0)
    database_reachable: bool
    cache_reachable: bool

    model_config = {"json_schema_extra": {
        "example": {
            "uptime_seconds": 3600.0,
            "cpu_percent": 12.5,
            "memory_percent": 48.2,
            "disk_percent": 63.1,
            "api_latency_ms": 4.2,
            "database_reachable": True,
            "cache_reachable": True,
        }
    }}


class HealthResponse(BaseModel):
    status: str

    model_config = {"json_schema_extra": {"example": {"status": "ok"}}}


class ReadinessResponse(BaseModel):
    status: str
    checks: dict[str, str]

    model_config = {"json_schema_extra": {
        "example": {"status": "ok", "checks": {"database": "ok", "cache": "ok"}}
    }}
