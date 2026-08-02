"""Tests for the shared landing poster mosaic API."""

from __future__ import annotations

import uuid
from typing import Any, cast

import pytest
from app.core.cache import get_cache, init_cache, run_coro_sync
from app.core.config import Settings, get_settings
from app.core.security import hash_rate_limit_subject
from app.metadata import service as metadata_service
from app.metadata.cache_keys import landing_top_posters_key
from app.metadata.schemas import LandingPoster, LandingPostersResponse
from app.metadata.tmdb.client import TmdbClient
from fastapi.testclient import TestClient
from pydantic import ValidationError


class _FakeTopRatedClient:
    """Minimal stand-in for ``TmdbClient.get_movie_top_rated``."""

    def __init__(self, pages: dict[int, list[dict[str, Any]]]) -> None:
        self._pages = pages
        self.calls: list[int] = []

    async def get_movie_top_rated(self, *, page: int = 1) -> dict[str, Any]:
        self.calls.append(page)
        return {'results': self._pages.get(page, [])}


def _settings_kwargs() -> dict[str, str]:
    return {
        'database_url': (
            'postgresql+asyncpg://aperture:aperture@localhost:5432/aperture'
        ),
        'jwt_secret': 'test-jwt-secret-not-for-production-use-32b',
    }


@pytest.mark.asyncio
async def test_fetch_landing_top_posters_collects_across_pages() -> None:
    client = _FakeTopRatedClient(
        {
            1: [
                {'title': f'Movie {i}', 'poster_path': f'/p{i}.jpg'} for i in range(20)
            ],
            2: [
                {'title': f'Movie {i}', 'poster_path': f'/p{i}.jpg'}
                for i in range(20, 40)
            ],
            3: [
                {'title': f'Movie {i}', 'poster_path': f'/p{i}.jpg'}
                for i in range(40, 55)
            ],
        }
    )
    settings = get_settings()
    result = await metadata_service.fetch_landing_top_posters(
        settings,
        count=50,
        client=cast(TmdbClient, client),
    )
    assert len(result.posters) == 50
    assert result.posters[0].poster_url.endswith('/w154/p0.jpg')
    assert result.posters[49].title == 'Movie 49'
    assert client.calls == [1, 2, 3]


@pytest.mark.asyncio
async def test_fetch_landing_top_posters_skips_missing_paths() -> None:
    client = _FakeTopRatedClient(
        {
            1: [
                {'title': 'Has poster', 'poster_path': '/ok.jpg'},
                {'title': 'No poster', 'poster_path': None},
                {'title': 'Empty path', 'poster_path': ''},
            ],
        }
    )
    result = await metadata_service.fetch_landing_top_posters(
        get_settings(),
        count=10,
        client=cast(TmdbClient, client),
    )
    assert len(result.posters) == 1
    assert result.posters[0].title == 'Has poster'


def test_landing_posters_empty_without_tmdb_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('TMDB_API_KEY', '')
    get_settings.cache_clear()
    init_cache('')

    first = client.get('/api/v1/landing/posters')
    assert first.status_code == 200, first.text
    assert first.json() == {'posters': []}
    assert first.headers.get('x-cache') == 'BYPASS'
    assert 'max-age=60' in first.headers.get('cache-control', '')

    settings = get_settings()
    key = landing_top_posters_key(count=settings.landing_posters_count)
    assert run_coro_sync(get_cache().get(key)) is None

    second = client.get('/api/v1/landing/posters')
    assert second.status_code == 200, second.text
    assert second.json() == {'posters': []}
    assert second.headers.get('x-cache') == 'BYPASS'
    assert run_coro_sync(get_cache().get(key)) is None


def test_landing_posters_uses_cache_backend(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('TMDB_API_KEY', 'test-tmdb-key')
    get_settings.cache_clear()
    init_cache('')

    calls = {'n': 0}

    async def fake_fetch(
        settings: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> LandingPostersResponse:
        del settings, count, client
        calls['n'] += 1
        return LandingPostersResponse(
            posters=[
                LandingPoster(
                    poster_url='https://image.tmdb.org/t/p/w154/x.jpg',
                    title='Cached',
                )
            ]
        )

    monkeypatch.setattr(
        metadata_service,
        'fetch_landing_top_posters',
        fake_fetch,
    )

    first = client.get('/api/v1/landing/posters')
    assert first.status_code == 200, first.text
    assert first.headers.get('x-cache') == 'MISS'
    assert 'max-age=3600' in first.headers.get('cache-control', '')
    assert first.json()['posters'][0]['title'] == 'Cached'

    second = client.get('/api/v1/landing/posters')
    assert second.status_code == 200, second.text
    assert second.headers.get('x-cache') == 'HIT'
    assert 'max-age=3600' in second.headers.get('cache-control', '')
    assert second.json() == first.json()
    assert calls['n'] == 1

    settings = get_settings()
    key = landing_top_posters_key(count=settings.landing_posters_count)
    assert run_coro_sync(get_cache().get(key)) is not None


def test_landing_posters_tmdb_failure_negative_caches(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('TMDB_API_KEY', 'test-tmdb-key')
    get_settings.cache_clear()
    init_cache('')

    calls = {'n': 0}

    async def fake_fetch(
        settings: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> LandingPostersResponse:
        del settings, count, client
        calls['n'] += 1
        raise metadata_service.LandingPostersUnavailableError('tmdb down')

    monkeypatch.setattr(
        metadata_service,
        'fetch_landing_top_posters',
        fake_fetch,
    )

    first = client.get('/api/v1/landing/posters')
    assert first.status_code == 200, first.text
    assert first.json() == {'posters': []}
    assert first.headers.get('x-cache') == 'MISS'
    assert 'max-age=60' in first.headers.get('cache-control', '')

    second = client.get('/api/v1/landing/posters')
    assert second.status_code == 200, second.text
    assert second.json() == {'posters': []}
    assert second.headers.get('x-cache') == 'HIT'
    assert 'max-age=60' in second.headers.get('cache-control', '')
    assert calls['n'] == 1

    settings = get_settings()
    key = landing_top_posters_key(count=settings.landing_posters_count)
    assert run_coro_sync(get_cache().get(key)) is not None


def test_landing_posters_does_not_overwrite_warm_cache_on_empty_fetch(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('TMDB_API_KEY', 'test-tmdb-key')
    get_settings.cache_clear()
    init_cache('')

    settings = get_settings()
    key = landing_top_posters_key(count=settings.landing_posters_count)
    warm = LandingPostersResponse(
        posters=[
            LandingPoster(
                poster_url='https://image.tmdb.org/t/p/w154/warm.jpg',
                title='Warm',
            )
        ]
    )
    run_coro_sync(
        get_cache().set(
            key,
            warm.model_dump_json(),
            ttl_seconds=settings.landing_posters_cache_ttl_seconds,
        )
    )

    calls = {'n': 0}
    reads = {'n': 0}
    cache = get_cache()
    original_get = cache.get

    async def miss_then_hit(cache_key: str) -> str | None:
        if cache_key == key:
            reads['n'] += 1
            # Outer + lock re-get miss so we enter the fetch path; the
            # get-before-empty-set read should still see the warm entry.
            if reads['n'] <= 2:
                return None
        return await original_get(cache_key)

    async def fake_fetch(
        settings_arg: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> LandingPostersResponse:
        del settings_arg, count, client
        calls['n'] += 1
        raise metadata_service.LandingPostersUnavailableError('tmdb down')

    monkeypatch.setattr(cache, 'get', miss_then_hit)
    monkeypatch.setattr(
        metadata_service,
        'fetch_landing_top_posters',
        fake_fetch,
    )

    res = client.get('/api/v1/landing/posters')
    assert res.status_code == 200, res.text
    assert res.json()['posters'][0]['title'] == 'Warm'
    assert 'max-age=3600' in res.headers.get('cache-control', '')
    assert calls['n'] == 1

    cached = run_coro_sync(original_get(key))
    assert cached is not None
    assert LandingPostersResponse.model_validate_json(cached) == warm


def test_landing_posters_count_bounds_reject_invalid() -> None:
    with pytest.raises(ValidationError):
        Settings(**_settings_kwargs(), landing_posters_count=0)
    with pytest.raises(ValidationError):
        Settings(**_settings_kwargs(), landing_posters_count=301)


def test_landing_posters_count_bounds_via_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('LANDING_POSTERS_COUNT', '0')
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()

    monkeypatch.setenv('LANDING_POSTERS_COUNT', '301')
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()


def test_landing_posters_rate_limit_returns_429(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    unique_ip = f'203.0.113.{uuid.uuid4().int % 200 + 10}'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('TMDB_API_KEY', '')
    monkeypatch.setenv('LANDING_POSTERS_RATE_LIMIT_MAX_PER_IP', '2')
    get_settings.cache_clear()
    init_cache('')

    headers = {
        'X-Aperture-Client-IP': unique_ip,
        'X-Aperture-BFF-Secret': secret,
    }
    first = client.get('/api/v1/landing/posters', headers=headers)
    second = client.get('/api/v1/landing/posters', headers=headers)
    third = client.get('/api/v1/landing/posters', headers=headers)
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert third.status_code == 429, third.text
    assert 'landing poster' in third.json()['detail'].lower()

    rl_key = f'metadata:rl:landing:ip:{hash_rate_limit_subject(unique_ip)}'
    assert run_coro_sync(get_cache().get(rl_key)) is not None
