from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import setup_logging
from app.api.v1.health import router as health_router
from app.database.session import init_db, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    await init_db()
    yield
    await engine.dispose()


app = FastAPI(
    title="Blue-Sentinel API",
    description="Personal portfolio backend: contact form, detection lab, GitHub stats, health",
    version="0.1.0",
    docs_url=f"{settings.api_v1_str}/docs",
    redoc_url=f"{settings.api_v1_str}/redoc",
    lifespan=lifespan,
)

# CORS - restrict in production
if settings.debug:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_hosts.split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Router inclusion
app.include_router(health_router, prefix=settings.api_v1_str)


@app.get("/", tags=["root"])
async def root():
    return {"message": "Blue-Sentinel API is running", "version": "0.1.0"}