from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


def get_sync_database_url() -> str:
    return settings.database_url.replace("+asyncpg", "+psycopg2", 1)


engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def ping_database() -> bool:
    try:
        async with engine.connect() as connection:
            await connection.run_sync(lambda _: None)
        return True
    except Exception:
        return False


async def close_database_connections() -> None:
    await engine.dispose()
