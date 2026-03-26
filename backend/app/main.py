import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.datasets import router as datasets_router
from app.api.import_engine import router as import_router
from app.api.projects import router as projects_router
from app.api.qc import router as qc_router
from app.config import settings
from app.database import close_database_connections, ping_database


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    database_available = await ping_database()
    if not database_available:
        logger.warning("Database connectivity check failed during startup.")
    try:
        yield
    finally:
        await close_database_connections()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.debug else settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok", "version": settings.app_version}


app.include_router(projects_router)
app.include_router(datasets_router)
app.include_router(import_router)
app.include_router(qc_router)
