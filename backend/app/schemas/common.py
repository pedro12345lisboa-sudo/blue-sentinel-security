import uuid

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    """RFC 9457 problem+json error format."""
    type: str = Field(default="about:blank")
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    request_id: str = Field(default_factory=lambda: uuid.uuid4().hex)

    model_config = {"json_schema_extra": {
        "example": {
            "type": "about:blank",
            "title": "Validation Error",
            "status": 422,
            "detail": "name: Field required",
            "request_id": "a1b2c3d4e5f6",
        }
    }}


class PaginationParams(BaseModel):
    skip: int = Field(default=0, ge=0, le=1000)
    limit: int = Field(default=50, ge=1, le=100)
