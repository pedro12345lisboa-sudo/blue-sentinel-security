from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from starlette import status
import uuid


class BlueSentinelError(Exception):
    """Base exception for the application."""
    def __init__(self, message: str, code: str = "ERROR", status_code: int = 500):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.request_id = str(uuid.uuid4())


class ValidationError(BlueSentinelError):
    def __init__(self, message: str):
        super().__init__(message, code="VALIDATION_ERROR", status_code=400)


class NotFoundError(BlueSentinelError):
    def __init__(self, resource: str, detail: str = None):
        super().__init__(
            message=detail or f"{resource} not found",
            code="NOT_FOUND",
            status_code=404,
        )


class RateLimitError(BlueSentinelError):
    def __init__(self, retry_after: int):
        super().__init__(
            message="Rate limit exceeded",
            code="RATE_LIMIT",
            status_code=429,
        )
        self.retry_after = retry_after


async def blue_sentinel_error_handler(request: Request, exc: BlueSentinelError):
    headers = {"Retry-After": str(exc.retry_after)} if isinstance(exc, RateLimitError) else None
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.code,
            "message": exc.message,
            "request_id": exc.request_id,
        },
        headers=headers,
    )


async def http_exception_handler(request: Request, exc: FastAPIHTTPException):
    detail = exc.detail
    code = "HTTP_ERROR"
    if isinstance(detail, dict):
        code = str(detail.get("code") or code)
        detail = detail.get("message")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": code,
            "message": detail,
            "request_id": getattr(request.state, "request_id", None),
        },
        headers=getattr(exc, "headers", None),
    )


async def database_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": "INTERNAL_ERROR",
            "message": "An unexpected error occurred",
            "request_id": getattr(request.state, "request_id", None),
        },
    )