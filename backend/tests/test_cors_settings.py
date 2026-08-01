"""CORS settings stay off by default (BFF is the browser path)."""

import pytest
from app.core.config import Settings


def test_cors_origins_empty_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        'DATABASE_URL',
        'postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
    )
    monkeypatch.setenv('CORS_ORIGINS', '')
    settings = Settings()
    assert settings.cors_origin_list() == []


def test_cors_origins_parses_csv(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        'DATABASE_URL',
        'postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
    )
    monkeypatch.setenv(
        'CORS_ORIGINS',
        'http://localhost:3000, https://example.com',
    )
    settings = Settings()
    assert settings.cors_origin_list() == [
        'http://localhost:3000',
        'https://example.com',
    ]
