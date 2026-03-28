import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.analysis import router as analysis_router
from app.api.datasets import router as datasets_router
from app.api.export import router as export_router
from app.api.import_engine import router as import_router
from app.api.mcp import router as mcp_router
from app.api.projects import router as projects_router
from app.api.qc import router as qc_router
from app.api.reports import router as reports_router
from app.config import settings
from app.database import SessionLocal, close_database_connections, ping_database
from app.services.energy_estimate import ensure_seeded_default_power_curve


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    database_available = await ping_database()
    if not database_available:
        logger.warning("Database connectivity check failed during startup.")
    else:
        async with SessionLocal() as session:
            await ensure_seeded_default_power_curve(session)
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
app.include_router(analysis_router)
app.include_router(mcp_router)
app.include_router(export_router)
app.include_router(reports_router)
