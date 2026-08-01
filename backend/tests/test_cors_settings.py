"""CORS settings stay off by default (BFF is the browser path)."""

import pytest
from app.core.config import Settings
from fastapi.testclient import TestClient


def _db_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        'DATABASE_URL',
        'postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
    )


def test_cors_origins_empty_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    _db_env(monkeypatch)
    monkeypatch.setenv('CORS_ORIGINS', '')
    settings = Settings()
    assert settings.cors_origin_list() == []


def test_cors_origins_parses_csv(monkeypatch: pytest.MonkeyPatch) -> None:
    _db_env(monkeypatch)
    monkeypatch.setenv(
        'CORS_ORIGINS',
        'http://localhost:3000, https://example.com',
    )
    settings = Settings()
    assert settings.cors_origin_list() == [
        'http://localhost:3000',
        'https://example.com',
    ]


def test_cors_origins_rejects_wildcard(monkeypatch: pytest.MonkeyPatch) -> None:
    _db_env(monkeypatch)
    monkeypatch.setenv('CORS_ORIGINS', '*')
    settings = Settings()
    with pytest.raises(ValueError, match='must not be \\*'):
        settings.cors_origin_list()


def test_cors_origins_rejects_non_url(monkeypatch: pytest.MonkeyPatch) -> None:
    _db_env(monkeypatch)
    monkeypatch.setenv('CORS_ORIGINS', 'localhost:3000')
    settings = Settings()
    with pytest.raises(ValueError, match='http\\(s\\)'):
        settings.cors_origin_list()


def test_create_app_has_no_cors_by_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _db_env(monkeypatch)
    monkeypatch.setenv('CORS_ORIGINS', '')
    from app.core.config import get_settings
    from app.main import create_app

    get_settings.cache_clear()
    app = create_app()
    with TestClient(app) as client:
        response = client.options(
            '/health/live',
            headers={
                'Origin': 'http://localhost:3000',
                'Access-Control-Request-Method': 'GET',
            },
        )
    # Without CORS middleware, preflight is not answered with ACAO.
    assert 'access-control-allow-origin' not in response.headers
    get_settings.cache_clear()


def test_create_app_cors_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _db_env(monkeypatch)
    monkeypatch.setenv('CORS_ORIGINS', 'http://localhost:3000')
    from app.core.config import get_settings
    from app.main import create_app

    get_settings.cache_clear()
    app = create_app()
    with TestClient(app) as client:
        response = client.get(
            '/health/live',
            headers={'Origin': 'http://localhost:3000'},
        )
    assert response.headers.get('access-control-allow-origin') == (
        'http://localhost:3000'
    )
    get_settings.cache_clear()
