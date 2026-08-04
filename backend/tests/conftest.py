"""Pytest fixtures and env defaults for the backend suite."""

from __future__ import annotations

import os
from collections.abc import Iterator

# Must run before importing the FastAPI app (settings require DATABASE_URL).
os.environ.setdefault(
    'DATABASE_URL',
    'postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
)
os.environ.setdefault(
    'JWT_SECRET',
    'test-jwt-secret-not-for-production-use-32b',
)
# Match docker-compose local default so trusted-IP tests can opt in via headers.
os.environ.setdefault('AUTH_BFF_SHARED_SECRET', 'test-bff-shared-secret')

import pytest
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> Iterator[None]:
    """Ensure settings re-read env between tests when needed."""
    from app.auth.service import reset_refresh_grace_l1
    from app.core.cache import reset_cache
    from app.core.config import get_settings
    from app.library.rate_limit import (
        reset_library_contains_rate_limit_fallback,
    )
    from app.lists.rate_limit import reset_lists_rate_limit_fallback
    from app.metadata import resolve as metadata_resolve
    from app.metadata.rate_limit import reset_metadata_rate_limit_fallback
    from app.search.rate_limit import reset_search_rate_limit_fallback
    from app.users.rate_limit import reset_users_public_rate_limit_fallback

    get_settings.cache_clear()
    reset_cache()
    metadata_resolve._resolve_flights.clear()
    reset_refresh_grace_l1()
    reset_search_rate_limit_fallback()
    reset_lists_rate_limit_fallback()
    reset_library_contains_rate_limit_fallback()
    reset_metadata_rate_limit_fallback()
    reset_users_public_rate_limit_fallback()
    yield
    get_settings.cache_clear()
    reset_cache()
    metadata_resolve._resolve_flights.clear()
    reset_refresh_grace_l1()
    reset_search_rate_limit_fallback()
    reset_lists_rate_limit_fallback()
    reset_library_contains_rate_limit_fallback()
    reset_metadata_rate_limit_fallback()
    reset_users_public_rate_limit_fallback()


@pytest.fixture
def client() -> Iterator[TestClient]:
    """HTTP client that runs app lifespan (engine init/dispose)."""
    with TestClient(app) as test_client:
        yield test_client
