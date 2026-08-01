"""FastAPI dependency injection stubs."""

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends

from app.core.config import Settings, get_settings

SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_db_session_stub() -> Generator[None, None, None]:
    """Placeholder DB session dependency (wired in P0.2 / P0.4)."""
    yield None
