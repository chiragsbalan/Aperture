"""FastAPI dependency injection helpers."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import session_scope

SettingsDep = Annotated[Settings, Depends(get_settings)]


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """Yield a request-scoped DB session.

    Does not auto-commit. Callers that mutate state must
    ``await session.commit()`` explicitly before returning.
    """
    async with session_scope() as session:
        yield session


DbSessionDep = Annotated[AsyncSession, Depends(get_db_session)]
