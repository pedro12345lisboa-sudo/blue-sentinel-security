from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=128)
    password: str = Field(..., min_length=8)

    model_config = {"json_schema_extra": {
        "example": {"username": "admin", "password": "secretpass123"}
    }}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int

    model_config = {"json_schema_extra": {
        "example": {"access_token": "eyJ...", "token_type": "bearer", "expires_in": 3600}
    }}


class MessageSummary(BaseModel):
    id: int
    name: str
    email: str
    subject: str
    read: bool
    created_at: datetime

    model_config = {"json_schema_extra": {
        "example": {
            "id": 1,
            "name": "Maria Silva",
            "email": "maria@example.com",
            "subject": "Orçamento",
            "read": False,
            "created_at": "2026-09-29T18:00:00Z",
        }
    }}


class MessageListResponse(BaseModel):
    items: list[MessageSummary]
    total: int

    model_config = {"json_schema_extra": {
        "example": {"items": [], "total": 0}
    }}


class MarkReadRequest(BaseModel):
    message_ids: list[int] = Field(..., min_length=1, max_length=100)

    model_config = {"json_schema_extra": {"example": {"message_ids": [1, 2, 3]}}}


class MarkReadResponse(BaseModel):
    updated: int
