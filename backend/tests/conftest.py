from __future__ import annotations

import os
from collections.abc import AsyncGenerator

import psycopg2
import psycopg2.sql
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app
from app.models import AnalysisResult, DataColumn, Dataset, Flag, FlagRule, FlaggedRange, Project, TimeseriesData


TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://windwhisper:windwhisper@localhost:5432/windwhisper_test",
)


def ensure_test_database_exists() -> None:
    test_url = make_url(TEST_DATABASE_URL)
    database_name = test_url.database
    if database_name is None:
        raise RuntimeError("TEST_DATABASE_URL must include a database name")

    connection = psycopg2.connect(
        dbname="postgres",
        user=test_url.username,
        password=test_url.password,
        host=test_url.host,
        port=test_url.port,
    )
    connection.autocommit = True

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (database_name,))
            if cursor.fetchone() is None:
                cursor.execute(
                    psycopg2.sql.SQL("CREATE DATABASE {}")
                    .format(psycopg2.sql.Identifier(database_name)),
                )
    finally:
        connection.close()


async def truncate_all_tables(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            await connection.execute(
                text(f'TRUNCATE TABLE "{table.name}" RESTART IDENTITY CASCADE'),
            )


@pytest_asyncio.fixture
async def test_engine() -> AsyncGenerator[AsyncEngine, None]:
    ensure_test_database_exists()
    engine = create_async_engine(TEST_DATABASE_URL, pool_pre_ping=True)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    async with session_factory() as session:
        yield session

    await truncate_all_tables(test_engine)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client

    app.dependency_overrides.clear()