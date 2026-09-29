from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class ContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, examples=["Maria Silva"])
    email: EmailStr = Field(..., examples=["maria@example.com"])
    subject: str = Field(..., min_length=1, max_length=255, examples=["Orçamento"])
    message: str = Field(..., min_length=1, max_length=5000, examples=["Olá, gostaria de conversar."])
    honeypot: str = Field(default="", max_length=255, description="Must be empty (bot trap)")

    model_config = {"json_schema_extra": {
        "example": {
            "name": "Maria Silva",
            "email": "maria@example.com",
            "subject": "Orçamento",
            "message": "Olá, gostaria de conversar sobre um projeto.",
            "honeypot": "",
        }
    }}


class ContactAccepted(BaseModel):
    id: int
    status: str = "queued"
    request_id: str

    model_config = {"json_schema_extra": {
        "example": {"id": 1, "status": "queued", "request_id": "a1b2c3d4"}
    }}
