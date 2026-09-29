import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.logging import setup_logging
from app.database.session import init_db, engine
from app.api.v1.contact import router as contact_router
from app.api.v1.github import router as github_router
from app.api.v1.lab import router as lab_router
from app.api.v1.ws_lab import router as ws_lab_router
from app.api.v1.status import router as status_router
from app.api.v1.health import router as health_router
from app.api.v1.auth import router as auth_router
from app.api.v1.admin import router as admin_router


def _problem(status: int, title: str, detail: str | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": title,
            "status": status,
            "detail": detail,
            "request_id": uuid.uuid4().hex[:12],
        },
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    await init_db()
    yield
    await engine.dispose()


app = FastAPI(
    title="Blue-Sentinel API",
    description=(
        "Portfólio backend: formulário de contato, laboratório de detecção, "
        "estatísticas GitHub e saúde do sistema."
    ),
    version="0.1.0",
    docs_url=f"{settings.api_v1_str}/docs",
    redoc_url=f"{settings.api_v1_str}/redoc",
    lifespan=lifespan,
)

# CORS restrito à origem do site
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_hosts.split(",") if not settings.debug else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = "; ".join(
        f"{'.'.join(str(l) for l in e.get('loc', []))}: {e.get('msg', '')}"
        for e in exc.errors()
    )
    return _problem(422, "Erro de validação", errors)


@app.exception_handler(StarletteHTTPException)
async def http_handler(request: Request, exc: StarletteHTTPException):
    return _problem(exc.status_code, "Erro", str(exc.detail))


@app.exception_handler(Exception)
async def generic_handler(request: Request, exc: Exception):
    # Nunca vaza stack trace ou SQL
    return _problem(500, "Erro interno", "Ocorreu um erro inesperado.")


app.include_router(contact_router, prefix=settings.api_v1_str)
app.include_router(github_router, prefix=settings.api_v1_str)
app.include_router(lab_router, prefix=settings.api_v1_str)
app.include_router(ws_lab_router, prefix=settings.api_v1_str)
app.include_router(status_router, prefix=settings.api_v1_str)
app.include_router(health_router, prefix=settings.api_v1_str)
app.include_router(auth_router, prefix=settings.api_v1_str)
app.include_router(admin_router, prefix=settings.api_v1_str)


@app.get("/", tags=["root"])
async def root():
    return {"message": "Blue-Sentinel API", "version": "0.1.0"}
