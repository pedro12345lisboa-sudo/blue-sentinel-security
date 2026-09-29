from datetime import datetime

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
    id: str
    name: str
    description: str
    severity: str

    model_config = {"json_schema_extra": {
        "example": {
            "id": "suspicious-powershell",
            "name": "PowerShell EncodedCommand",
            "description": "Detecta execução de PowerShell com comando codificado em base64",
            "severity": "high",
        }
    }}
