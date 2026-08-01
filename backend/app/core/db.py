"""Async database engine and connectivity helpers."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings, get_settings
from app.core.db_ssl import asyncpg_connect_args

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_db(settings: Settings | None = None) -> AsyncEngine:
    """Create (or return) the process-wide async engine."""
    global _engine, _session_factory
    if _engine is not None:
        return _engine

    resolved = settings or get_settings()
    _engine = create_async_engine(
        resolved.database_url,
        pool_pre_ping=True,
        connect_args=asyncpg_connect_args(resolved.database_url),
    )
    _session_factory = async_sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    return _engine


def get_engine() -> AsyncEngine:
    """Return the initialized engine, creating it if needed."""
    if _engine is None:
        return init_db()
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the async session factory."""
    if _session_factory is None:
        init_db()
    if _session_factory is None:
        raise RuntimeError('Database session factory failed to initialize')
    return _session_factory


async def ping_database() -> None:
    """Raise if Postgres is unreachable."""
    engine = get_engine()
    async with engine.connect() as connection:
        await connection.execute(text('SELECT 1'))


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Yield a short-lived session; callers commit writes explicitly."""
    factory = get_session_factory()
    session = factory()
    try:
        yield session
    finally:
        await session.close()


async def dispose_db() -> None:
    """Dispose the engine (tests / shutdown)."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
