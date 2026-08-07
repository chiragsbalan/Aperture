"""Tests for the signed-in home top-movies API."""

from __future__ import annotations

import uuid
from typing import Any, cast

import pytest
from app.auth.deps import get_optional_identity
from app.auth.models import Identity
from app.core.cache import get_cache, init_cache, run_coro_sync
from app.core.config import Settings, get_settings
from app.core.security import hash_rate_limit_subject
from app.main import app
from app.metadata import service as metadata_service
from app.metadata.cache_keys import top_movies_key
from app.metadata.schemas import (
    NowInTheatresResponse,
    TopMovie,
    TopMoviesResponse,
    TopTvShowsResponse,
)
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


def _movie_row(index: int) -> dict[str, Any]:
    return {
        'id': 1000 + index,
        'title': f'Movie {index}',
        'poster_path': f'/p{index}.jpg',
        'release_date': f'{2000 + (index % 20)}-01-15',
    }


def _sample_pool(*, size: int = 20) -> TopMoviesResponse:
    return TopMoviesResponse(
        movies=[
            TopMovie(
                tmdb_id=i,
                title=f'Title {i}',
                poster_url=f'https://image.tmdb.org/t/p/w500/{i}.jpg',
                year=2000 + i,
            )
            for i in range(1, size + 1)
        ]
    )


@pytest.mark.asyncio
async def test_fetch_top_movies_pool_collects_across_pages() -> None:
    client = _FakeTopRatedClient(
        {
            1: [_movie_row(i) for i in range(20)],
            2: [_movie_row(i) for i in range(20, 40)],
            3: [_movie_row(i) for i in range(40, 55)],
        }
    )
    result = await metadata_service.fetch_top_movies_pool(
        get_settings(),
        count=50,
        client=cast(TmdbClient, client),
    )
    assert len(result.movies) == 50
    assert result.movies[0].poster_url.endswith('/w500/p0.jpg')
    assert result.movies[0].tmdb_id == 1000
    assert result.movies[0].year == 2000
    assert result.movies[49].title == 'Movie 49'
    assert client.calls == [1, 2, 3]


@pytest.mark.asyncio
async def test_fetch_top_movies_pool_skips_invalid_rows() -> None:
    client = _FakeTopRatedClient(
        {
            1: [
                _movie_row(1),
                {
                    'id': 2,
                    'title': 'No poster',
                    'poster_path': None,
                    'release_date': '1999-01-01',
                },
                {
                    'id': -1,
                    'title': 'Bad id',
                    'poster_path': '/bad.jpg',
                    'release_date': '1999-01-01',
                },
                {
                    'id': 3,
                    'title': '',
                    'poster_path': '/empty-title.jpg',
                    'release_date': '1999-01-01',
                },
            ],
        }
    )
    result = await metadata_service.fetch_top_movies_pool(
        get_settings(),
        count=10,
        client=cast(TmdbClient, client),
    )
    assert len(result.movies) == 1
    assert result.movies[0].title == 'Movie 1'


def test_top_movies_empty_without_tmdb_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('TMDB_API_KEY', '')
    get_settings.cache_clear()
    init_cache('')

    first = client.get('/api/v1/catalog/top-movies')
    assert first.status_code == 200, first.text
    assert first.json() == {'movies': []}
    assert first.headers.get('x-cache') == 'BYPASS'
    assert first.headers.get('cache-control') == 'private, no-store'

    settings = get_settings()
    key = top_movies_key(count=settings.top_movies_pool_count)
    assert run_coro_sync(get_cache().get(key)) is None


def test_top_movies_uses_cache_and_respects_limit(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('TMDB_API_KEY', 'test-tmdb-key')
    get_settings.cache_clear()
    init_cache('')

    calls = {'n': 0}
    pool = _sample_pool(size=20)

    async def fake_fetch(
        settings: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> TopMoviesResponse:
        del settings, count, client
        calls['n'] += 1
        return pool

    monkeypatch.setattr(
        metadata_service,
        'fetch_top_movies_pool',
        fake_fetch,
    )

    first = client.get('/api/v1/catalog/top-movies?limit=5')
    assert first.status_code == 200, first.text
    assert first.headers.get('x-cache') == 'MISS'
    assert first.headers.get('cache-control') == 'private, no-store'
    assert len(first.json()['movies']) == 5
    assert {m['tmdb_id'] for m in first.json()['movies']}.issubset(
        {m.tmdb_id for m in pool.movies}
    )

    second = client.get('/api/v1/catalog/top-movies?limit=5')
    assert second.status_code == 200, second.text
    assert second.headers.get('x-cache') == 'HIT'
    assert len(second.json()['movies']) == 5
    assert calls['n'] == 1

    settings = get_settings()
    key = top_movies_key(count=settings.top_movies_pool_count)
    cached = run_coro_sync(get_cache().get(key))
    assert cached is not None
    cached_pool = TopMoviesResponse.model_validate_json(cached)
    assert len(cached_pool.movies) == 20


def test_top_movies_tmdb_failure_negative_caches(
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
    ) -> TopMoviesResponse:
        del settings, count, client
        calls['n'] += 1
        raise metadata_service.TopMoviesUnavailableError('tmdb down')

    monkeypatch.setattr(
        metadata_service,
        'fetch_top_movies_pool',
        fake_fetch,
    )

    first = client.get('/api/v1/catalog/top-movies')
    assert first.status_code == 200, first.text
    assert first.json() == {'movies': []}
    assert first.headers.get('x-cache') == 'MISS'

    second = client.get('/api/v1/catalog/top-movies')
    assert second.status_code == 200, second.text
    assert second.json() == {'movies': []}
    assert second.headers.get('x-cache') == 'HIT'
    assert calls['n'] == 1


def test_top_movies_does_not_overwrite_warm_cache_on_empty_fetch(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('TMDB_API_KEY', 'test-tmdb-key')
    get_settings.cache_clear()
    init_cache('')

    settings = get_settings()
    key = top_movies_key(count=settings.top_movies_pool_count)
    warm = TopMoviesResponse(
        movies=[
            TopMovie(
                tmdb_id=42,
                title='Warm',
                poster_url='https://image.tmdb.org/t/p/w500/warm.jpg',
                year=1999,
            )
        ]
    )
    run_coro_sync(
        get_cache().set(
            key,
            warm.model_dump_json(),
            ttl_seconds=settings.top_movies_cache_ttl_seconds,
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
    ) -> TopMoviesResponse:
        del settings_arg, count, client
        calls['n'] += 1
        raise metadata_service.TopMoviesUnavailableError('tmdb down')

    monkeypatch.setattr(cache, 'get', miss_then_hit)
    monkeypatch.setattr(
        metadata_service,
        'fetch_top_movies_pool',
        fake_fetch,
    )

    res = client.get('/api/v1/catalog/top-movies')
    assert res.status_code == 200, res.text
    assert res.json()['movies'][0]['title'] == 'Warm'
    assert res.headers.get('x-cache') == 'HIT'
    assert calls['n'] == 1

    cached = run_coro_sync(original_get(key))
    assert cached is not None
    assert TopMoviesResponse.model_validate_json(cached) == warm


def test_top_movies_pool_count_bounds_reject_invalid() -> None:
    with pytest.raises(ValidationError):
        Settings(**_settings_kwargs(), top_movies_pool_count=0)
    with pytest.raises(ValidationError):
        Settings(**_settings_kwargs(), top_movies_pool_count=501)
    with pytest.raises(ValidationError):
        Settings(
            **_settings_kwargs(),
            top_movies_pool_count=100,
            top_movies_max_auth_limit=101,
        )
    with pytest.raises(ValidationError):
        Settings(**_settings_kwargs(), top_movies_default_limit=0)
    with pytest.raises(ValidationError):
        Settings(**_settings_kwargs(), top_movies_default_limit=101)
    with pytest.raises(ValidationError):
        Settings(
            **_settings_kwargs(),
            top_movies_default_limit=25,
            top_movies_max_public_limit=24,
        )
    with pytest.raises(ValidationError):
        Settings(**_settings_kwargs(), top_movies_max_public_limit=0)
    with pytest.raises(ValidationError):
        Settings(**_settings_kwargs(), top_movies_max_public_limit=101)
    with pytest.raises(ValidationError):
        Settings(
            **_settings_kwargs(),
            top_movies_max_public_limit=24,
            top_movies_max_auth_limit=20,
        )


def test_top_movies_settings_bounds_via_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('TOP_MOVIES_POOL_COUNT', '0')
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()

    monkeypatch.setenv('TOP_MOVIES_POOL_COUNT', '501')
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()

    monkeypatch.delenv('TOP_MOVIES_POOL_COUNT', raising=False)
    monkeypatch.setenv('TOP_MOVIES_DEFAULT_LIMIT', '0')
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()

    monkeypatch.setenv('TOP_MOVIES_DEFAULT_LIMIT', '101')
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()

    monkeypatch.setenv('TOP_MOVIES_DEFAULT_LIMIT', '25')
    monkeypatch.setenv('TOP_MOVIES_MAX_PUBLIC_LIMIT', '24')
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()


def test_top_movies_rate_limit_returns_429(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Request-level RL charges every call (HIT / BYPASS / MISS), like landing."""
    secret = 'test-bff-shared-secret'
    unique_ip = f'203.0.113.{uuid.uuid4().int % 200 + 10}'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('TMDB_API_KEY', '')
    monkeypatch.setenv('TOP_MOVIES_RATE_LIMIT_MAX_PER_IP', '2')
    get_settings.cache_clear()
    init_cache('')

    headers = {
        'X-Aperture-Client-IP': unique_ip,
        'X-Aperture-BFF-Secret': secret,
    }
    first = client.get('/api/v1/catalog/top-movies', headers=headers)
    second = client.get('/api/v1/catalog/top-movies', headers=headers)
    third = client.get('/api/v1/catalog/top-movies', headers=headers)
    assert first.status_code == 200, first.text
    assert first.headers.get('x-cache') == 'BYPASS'
    assert second.status_code == 200, second.text
    assert third.status_code == 429, third.text
    assert 'top movies' in third.json()['detail'].lower()

    rl_key = f'metadata:rl:top-movies:ip:{hash_rate_limit_subject(unique_ip)}'
    assert run_coro_sync(get_cache().get(rl_key)) is not None


def test_top_movies_rate_limit_charges_warm_hit(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Warm HIT traffic still charges the request-level bucket."""
    secret = 'test-bff-shared-secret'
    unique_ip = f'203.0.113.{uuid.uuid4().int % 200 + 10}'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('TMDB_API_KEY', 'test-tmdb-key')
    monkeypatch.setenv('TOP_MOVIES_RATE_LIMIT_MAX_PER_IP', '2')
    get_settings.cache_clear()
    init_cache('')

    async def fake_fetch(
        settings: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> TopMoviesResponse:
        del settings, count, client
        return _sample_pool(size=5)

    monkeypatch.setattr(
        metadata_service,
        'fetch_top_movies_pool',
        fake_fetch,
    )

    headers = {
        'X-Aperture-Client-IP': unique_ip,
        'X-Aperture-BFF-Secret': secret,
    }
    first = client.get('/api/v1/catalog/top-movies', headers=headers)
    assert first.status_code == 200, first.text
    assert first.headers.get('x-cache') == 'MISS'

    second = client.get('/api/v1/catalog/top-movies', headers=headers)
    assert second.status_code == 200, second.text
    assert second.headers.get('x-cache') == 'HIT'

    third = client.get('/api/v1/catalog/top-movies', headers=headers)
    assert third.status_code == 429, third.text
    assert 'top movies' in third.json()['detail'].lower()

    rl_key = f'metadata:rl:top-movies:ip:{hash_rate_limit_subject(unique_ip)}'
    assert run_coro_sync(get_cache().get(rl_key)) is not None


class _FakeTvTopRatedClient:
    def __init__(self, pages: dict[int, list[dict[str, Any]]]) -> None:
        self._pages = pages

    async def get_tv_top_rated(self, *, page: int = 1) -> dict[str, Any]:
        return {'results': self._pages.get(page, [])}


class _FakeNowPlayingClient:
    def __init__(self, pages: dict[int, list[dict[str, Any]]]) -> None:
        self._pages = pages

    async def get_movie_now_playing(self, *, page: int = 1) -> dict[str, Any]:
        return {
            'results': self._pages.get(page, []),
            'total_pages': max(self._pages.keys()) if self._pages else 1,
        }


@pytest.mark.asyncio
async def test_fetch_top_tv_shows_pool_uses_name_and_air_date() -> None:
    client = _FakeTvTopRatedClient(
        {
            1: [
                {
                    'id': 42,
                    'name': 'Great Show',
                    'poster_path': '/tv.jpg',
                    'first_air_date': '2018-06-01',
                }
            ]
        }
    )
    result = await metadata_service.fetch_top_tv_shows_pool(
        get_settings(),
        count=10,
        client=cast(TmdbClient, client),
    )
    assert len(result.shows) == 1
    assert result.shows[0].tmdb_id == 42
    assert result.shows[0].title == 'Great Show'
    assert result.shows[0].year == 2018


@pytest.mark.asyncio
async def test_fetch_now_in_theatres_pool_orders_by_popularity() -> None:
    client = _FakeNowPlayingClient(
        {
            1: [
                {
                    'id': 1,
                    'title': 'Quiet Hit',
                    'poster_path': '/a.jpg',
                    'release_date': '2026-01-01',
                    'popularity': 10.0,
                },
                {
                    'id': 2,
                    'title': 'Blockbuster',
                    'poster_path': '/b.jpg',
                    'release_date': '2026-02-01',
                    'popularity': 99.0,
                },
            ]
        }
    )
    result = await metadata_service.fetch_now_in_theatres_pool(
        get_settings(),
        count=10,
        client=cast(TmdbClient, client),
    )
    assert [movie.title for movie in result.movies] == [
        'Blockbuster',
        'Quiet Hit',
    ]


def test_top_tv_and_theatres_empty_without_tmdb_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('TMDB_API_KEY', '')
    get_settings.cache_clear()
    init_cache('')

    tv = client.get('/api/v1/catalog/top-tv-shows')
    assert tv.status_code == 200, tv.text
    assert tv.json() == {'shows': []}

    theatres = client.get('/api/v1/catalog/now-in-theatres')
    assert theatres.status_code == 200, theatres.text
    assert theatres.json() == {'movies': []}


def test_home_rails_batches_three_pools(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('TMDB_API_KEY', 'test-tmdb-key')
    get_settings.cache_clear()
    init_cache('')

    movies_pool = _sample_pool(size=10)
    shows_pool = TopTvShowsResponse(
        shows=[
            TopMovie(
                tmdb_id=2000 + i,
                title=f'Show {i}',
                poster_url=f'https://image.tmdb.org/t/p/w342/s{i}.jpg',
                year=2010 + i,
            )
            for i in range(10)
        ],
    )
    theatres_pool = NowInTheatresResponse(
        movies=[
            TopMovie(
                tmdb_id=3000 + i,
                title=f'Theatre {i}',
                poster_url=f'https://image.tmdb.org/t/p/w342/t{i}.jpg',
                year=2024,
            )
            for i in range(10)
        ],
    )

    async def fake_movies(
        settings: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> TopMoviesResponse:
        del settings, count, client
        return movies_pool

    async def fake_shows(
        settings: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> TopTvShowsResponse:
        del settings, count, client
        return shows_pool

    async def fake_theatres(
        settings: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> NowInTheatresResponse:
        del settings, count, client
        return theatres_pool

    monkeypatch.setattr(metadata_service, 'fetch_top_movies_pool', fake_movies)
    monkeypatch.setattr(
        metadata_service,
        'fetch_top_tv_shows_pool',
        fake_shows,
    )
    monkeypatch.setattr(
        metadata_service,
        'fetch_now_in_theatres_pool',
        fake_theatres,
    )

    res = client.get('/api/v1/catalog/home-rails?limit=5')
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body['movies']) == 5
    assert len(body['shows']) == 5
    assert len(body['in_theatres']) == 5
    assert res.headers.get('cache-control') == 'private, no-store'


def test_public_rail_display_limit_clamps() -> None:
    """Oversize Query and elevated default both clamp to max_public_limit."""
    from app.metadata.api import _public_rail_display_limit

    settings = Settings.model_construct(
        **_settings_kwargs(),
        top_movies_default_limit=50,
        top_movies_max_public_limit=24,
    )
    assert _public_rail_display_limit(100, settings) == 24
    assert _public_rail_display_limit(None, settings) == 24
    assert _public_rail_display_limit(12, settings) == 12


def test_top_movies_clamps_oversize_limit(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Query limit above max_public_limit is clamped (not rejected)."""
    monkeypatch.setenv('TMDB_API_KEY', 'test-tmdb-key')
    monkeypatch.setenv('TOP_MOVIES_MAX_PUBLIC_LIMIT', '24')
    get_settings.cache_clear()
    init_cache('')

    pool = _sample_pool(size=50)

    async def fake_fetch(
        settings: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> TopMoviesResponse:
        del settings, count, client
        return pool

    monkeypatch.setattr(
        metadata_service,
        'fetch_top_movies_pool',
        fake_fetch,
    )

    res = client.get('/api/v1/catalog/top-movies?limit=100')
    assert res.status_code == 200, res.text
    assert len(res.json()['movies']) == 24


def test_top_movies_auth_allows_higher_limit(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Authenticated identity raises the clamp to max_auth_limit.

    Uses dependency override so this unit test does not need a migrated DB
    or real register (non-integration suite).
    """
    monkeypatch.setenv('TMDB_API_KEY', 'test-tmdb-key')
    monkeypatch.setenv('TOP_MOVIES_MAX_PUBLIC_LIMIT', '24')
    monkeypatch.setenv('TOP_MOVIES_MAX_AUTH_LIMIT', '500')
    get_settings.cache_clear()
    init_cache('')

    pool = _sample_pool(size=80)

    async def fake_fetch(
        settings: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> TopMoviesResponse:
        del settings, count, client
        return pool

    monkeypatch.setattr(
        metadata_service,
        'fetch_top_movies_pool',
        fake_fetch,
    )

    anon = client.get('/api/v1/catalog/top-movies?limit=80')
    assert anon.status_code == 200, anon.text
    assert len(anon.json()['movies']) == 24

    async def fake_authed_identity() -> Identity:
        return Identity(email='rail-auth@example.com', status='active')

    app.dependency_overrides[get_optional_identity] = fake_authed_identity
    try:
        authed = client.get('/api/v1/catalog/top-movies?limit=80')
        assert authed.status_code == 200, authed.text
        assert len(authed.json()['movies']) == 80
    finally:
        app.dependency_overrides.pop(get_optional_identity, None)


def test_top_tv_auth_allows_higher_limit(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Authenticated identity raises the top-TV clamp to max_auth_limit."""
    monkeypatch.setenv('TMDB_API_KEY', 'test-tmdb-key')
    monkeypatch.setenv('TOP_MOVIES_MAX_PUBLIC_LIMIT', '24')
    monkeypatch.setenv('TOP_MOVIES_MAX_AUTH_LIMIT', '500')
    get_settings.cache_clear()
    init_cache('')

    movies_pool = _sample_pool(size=80)
    pool = TopTvShowsResponse(shows=list(movies_pool.movies))

    async def fake_fetch(
        settings: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> TopTvShowsResponse:
        del settings, count, client
        return pool

    monkeypatch.setattr(
        metadata_service,
        'fetch_top_tv_shows_pool',
        fake_fetch,
    )

    anon = client.get('/api/v1/catalog/top-tv-shows?limit=80')
    assert anon.status_code == 200, anon.text
    assert len(anon.json()['shows']) == 24

    async def fake_authed_identity() -> Identity:
        return Identity(email='rail-tv-auth@example.com', status='active')

    app.dependency_overrides[get_optional_identity] = fake_authed_identity
    try:
        authed = client.get('/api/v1/catalog/top-tv-shows?limit=80')
        assert authed.status_code == 200, authed.text
        assert len(authed.json()['shows']) == 80
    finally:
        app.dependency_overrides.pop(get_optional_identity, None)


def test_top_movies_invalid_bearer_returns_401(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Invalid Bearer token must not fall through as an anonymous rail."""
    monkeypatch.setenv('TMDB_API_KEY', 'test-tmdb-key')
    get_settings.cache_clear()
    init_cache('')

    pool = _sample_pool(size=12)

    async def fake_fetch(
        settings: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> TopMoviesResponse:
        del settings, count, client
        return pool

    monkeypatch.setattr(
        metadata_service,
        'fetch_top_movies_pool',
        fake_fetch,
    )

    res = client.get(
        '/api/v1/catalog/top-movies',
        headers={'Authorization': 'Bearer not-a-valid-token'},
    )
    assert res.status_code == 401, res.text


def test_rail_display_limit_auth_vs_public() -> None:
    from app.metadata.api import _rail_display_limit

    settings = Settings.model_construct(
        **_settings_kwargs(),
        top_movies_default_limit=12,
        top_movies_max_public_limit=24,
        top_movies_max_auth_limit=500,
    )
    assert _rail_display_limit(100, settings, authenticated=False) == 24
    assert _rail_display_limit(100, settings, authenticated=True) == 100
    assert _rail_display_limit(600, settings, authenticated=True) == 500
    assert _rail_display_limit(None, settings, authenticated=True) == 12


def test_top_movies_omit_limit_respects_elevated_default_cap(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Omit-limit with default at the public max returns at most that many."""
    monkeypatch.setenv('TMDB_API_KEY', 'test-tmdb-key')
    monkeypatch.setenv('TOP_MOVIES_DEFAULT_LIMIT', '24')
    monkeypatch.setenv('TOP_MOVIES_MAX_PUBLIC_LIMIT', '24')
    get_settings.cache_clear()
    init_cache('')

    pool = _sample_pool(size=50)

    async def fake_fetch(
        settings: Settings,
        *,
        count: int | None = None,
        client: TmdbClient | None = None,
    ) -> TopMoviesResponse:
        del settings, count, client
        return pool

    monkeypatch.setattr(
        metadata_service,
        'fetch_top_movies_pool',
        fake_fetch,
    )

    res = client.get('/api/v1/catalog/top-movies')
    assert res.status_code == 200, res.text
    assert len(res.json()['movies']) == 24


def test_home_rails_share_rate_limit_bucket(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sequential top-movies / top-tv / now-in-theatres share one IP bucket."""
    secret = 'test-bff-shared-secret'
    unique_ip = f'203.0.113.{uuid.uuid4().int % 200 + 10}'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('TMDB_API_KEY', '')
    monkeypatch.setenv('TOP_MOVIES_RATE_LIMIT_MAX_PER_IP', '2')
    get_settings.cache_clear()
    init_cache('')

    headers = {
        'X-Aperture-Client-IP': unique_ip,
        'X-Aperture-BFF-Secret': secret,
    }
    first = client.get('/api/v1/catalog/top-movies', headers=headers)
    second = client.get('/api/v1/catalog/top-tv-shows', headers=headers)
    third = client.get('/api/v1/catalog/now-in-theatres', headers=headers)
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert third.status_code == 429, third.text
    assert 'top movies' in third.json()['detail'].lower()

    rl_key = f'metadata:rl:top-movies:ip:{hash_rate_limit_subject(unique_ip)}'
    assert run_coro_sync(get_cache().get(rl_key)) is not None
