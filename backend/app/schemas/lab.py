"""Pydantic schemas for the interactive detection lab (SOC Simulator)."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class LabSessionResponse(BaseModel):
    session_id: str
    ticket: str = Field(description="Short-lived ticket for WebSocket auth")
    expires_at: datetime

    model_config = {"json_schema_extra": {
        "example": {
            "session_id": "sess-abc123",
            "ticket": "tk-xyz789",
            "expires_at": "2026-09-29T20:00:00Z",
        }
    }}


class LabScenario(BaseModel):
    """Didactic scenario metadata (events are synthetic/defensive-only)."""

    id: str
    name: str
    description: str
    severity: str = Field(description="Expected final severity of the incident")
    event_count: int
    expected_rules: list[str]
    mitre: list[str]

    model_config = {"json_schema_extra": {
        "example": {
            "id": "brute-force",
            "name": "Credential brute force",
            "description": "Repeated failed logons followed by a success",
            "severity": "critical",
            "event_count": 9,
            "expected_rules": ["bs-auth-failed-logons", "corr-brute-force-sequence"],
            "mitre": ["T1110.001", "T1078"],
        }
    }}


class LabRuleSummary(BaseModel):
    """Rule catalog entry pushed with the WebSocket ``connected`` message."""

    id: str
    title: str
    level: str
    mitre: list[str]
    kind: Literal["sigma", "yara", "correlation"]
    description: str
    false_positives: list[str]
    response: list[str]


class LabRuleDetail(LabRuleSummary):
    """Full rule document backing the educational explanation panel."""

    source: str
    condition: str | None = None
    logsource: dict[str, Any] | None = None
    strings: list[dict[str, Any]] | None = None
    stages: list[dict[str, Any]] | None = None
    window_seconds: float | None = None
    group_by: list[str] | None = None
