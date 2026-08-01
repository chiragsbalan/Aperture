"""Pytest fixtures and env defaults for the backend suite."""

import os
from collections.abc import Iterator

import pytest
from app.main import app
from fastapi.testclient import TestClient

# Required before app/settings import in test modules.
os.environ.setdefault(
    'DATABASE_URL',
    'postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
)


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> Iterator[None]:
    """Ensure settings re-read env between tests when needed."""
    from app.core.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> Iterator[TestClient]:
    """HTTP client that runs app lifespan (engine init/dispose)."""
    with TestClient(app) as test_client:
        yield test_client
