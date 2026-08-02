"""Integration tests for on-click TMDb resolve / ingest."""

from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace

import pytest
from app.core.config import get_settings
from app.core.db import dispose_db, init_db, session_scope
from app.main import app
from app.metadata import ingest as metadata_ingest
from app.metadata import repository as metadata_repository
from app.metadata import resolve as metadata_resolve
from app.metadata.ingest import ensure_movie_from_tmdb, seed_from_fixtures
from app.metadata.tmdb.client import (
    TmdbClient,
    TmdbNotFoundError,
    TmdbUnavailableError,
)
from app.metadata.tmdb.dto import TmdbMovie, TmdbTvShow
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError


@pytest.fixture
def seeded_ids() -> dict[str, uuid.UUID]:
    """Seed fixtures and resolve well-known TMDb mappings."""

    async def _seed() -> dict[str, uuid.UUID]:
        async with session_scope() as session:
            await seed_from_fixtures(session)
            movie = await metadata_repository.get_external_id(
                session,
                source='tmdb',
                source_namespace='movie',
                external_id='278',
            )
            tv = await metadata_repository.get_external_id(
                session,
                source='tmdb',
                source_namespace='tv',
                external_id='1396',
            )
            assert movie is not None and movie.content_item_id is not None
            assert tv is not None and tv.content_item_id is not None
            return {
                'movie': movie.content_item_id,
                'tv': tv.content_item_id,
            }

    init_db()
    try:
        return asyncio.run(_seed())
    finally:
        asyncio.run(dispose_db())


@pytest.fixture
def api_client(seeded_ids: dict[str, uuid.UUID]) -> TestClient:
    del seeded_ids
    with TestClient(app) as client:
        yield client


@pytest.mark.integration
def test_resolve_movie_hit_existing(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    res = api_client.post('/api/v1/movies/resolve', json={'tmdb_id': 278})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['type'] == 'movie'
    assert body['id'] == str(seeded_ids['movie'])


@pytest.mark.integration
def test_resolve_tv_hit_existing(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    res = api_client.post('/api/v1/tv/resolve', json={'tmdb_id': 1396})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['type'] == 'tv_show'
    assert body['id'] == str(seeded_ids['tv'])


@pytest.mark.integration
def test_resolve_movie_miss_ingests(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tmdb_id = 9_000_001

    async def _fake_ingest(self: TmdbClient, requested_id: int) -> TmdbMovie:
        assert requested_id == tmdb_id
        return TmdbMovie(
            id=requested_id,
            title='Synthetic Resolve Movie',
            overview='Ingested via resolve test.',
            extras={'tagline': 'test'},
        )

    monkeypatch.setenv('TMDB_API_KEY', 'test-key-not-real')
    get_settings.cache_clear()
    monkeypatch.setattr(TmdbClient, 'get_movie_for_ingest', _fake_ingest)

    res = api_client.post('/api/v1/movies/resolve', json={'tmdb_id': tmdb_id})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['type'] == 'movie'
    content_id = body['id']

    detail = api_client.get(f'/api/v1/movies/{content_id}')
    assert detail.status_code == 200, detail.text
    assert detail.json()['title'] == 'Synthetic Resolve Movie'

    # Second resolve is a catalog hit (no TMDb call required).
    again = api_client.post('/api/v1/movies/resolve', json={'tmdb_id': tmdb_id})
    assert again.status_code == 200
    assert again.json()['id'] == content_id


@pytest.mark.integration
def test_resolve_movie_not_found_on_tmdb(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _missing(self: TmdbClient, requested_id: int) -> TmdbMovie:
        raise TmdbNotFoundError(f'missing {requested_id}')

    monkeypatch.setenv('TMDB_API_KEY', 'test-key-not-real')
    get_settings.cache_clear()
    monkeypatch.setattr(TmdbClient, 'get_movie_for_ingest', _missing)

    res = api_client.post('/api/v1/movies/resolve', json={'tmdb_id': 9_000_002})
    assert res.status_code == 404


@pytest.mark.integration
def test_resolve_tv_not_found_on_tmdb(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _missing(self: TmdbClient, requested_id: int) -> TmdbTvShow:
        raise TmdbNotFoundError(f'missing {requested_id}')

    monkeypatch.setenv('TMDB_API_KEY', 'test-key-not-real')
    get_settings.cache_clear()
    monkeypatch.setattr(TmdbClient, 'get_tv_for_ingest', _missing)

    res = api_client.post('/api/v1/tv/resolve', json={'tmdb_id': 9_000_102})
    assert res.status_code == 404


@pytest.mark.integration
def test_resolve_movie_unavailable_without_key(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('TMDB_API_KEY', '')
    get_settings.cache_clear()

    # Use an id that is not in fixtures so resolve must call TMDb.
    res = api_client.post('/api/v1/movies/resolve', json={'tmdb_id': 9_000_003})
    assert res.status_code == 503


@pytest.mark.integration
def test_resolve_movie_tmdb_upstream_unavailable_returns_503(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _upstream(self: TmdbClient, requested_id: int) -> TmdbMovie:
        raise TmdbUnavailableError('TMDb unavailable: HTTP 503')

    monkeypatch.setenv('TMDB_API_KEY', 'test-key-not-real')
    get_settings.cache_clear()
    monkeypatch.setattr(TmdbClient, 'get_movie_for_ingest', _upstream)

    res = api_client.post('/api/v1/movies/resolve', json={'tmdb_id': 9_000_004})
    assert res.status_code == 503


@pytest.mark.integration
def test_resolve_tv_miss_ingests(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    tmdb_id = 9_000_101

    async def _fake_ingest(self: TmdbClient, requested_id: int) -> TmdbTvShow:
        assert requested_id == tmdb_id
        return TmdbTvShow(
            id=requested_id,
            name='Synthetic Resolve Show',
            overview='Ingested via resolve test.',
            extras={},
        )

    monkeypatch.setenv('TMDB_API_KEY', 'test-key-not-real')
    get_settings.cache_clear()
    monkeypatch.setattr(TmdbClient, 'get_tv_for_ingest', _fake_ingest)

    res = api_client.post('/api/v1/tv/resolve', json={'tmdb_id': tmdb_id})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['type'] == 'tv_show'
    detail = api_client.get(f'/api/v1/tv/{body["id"]}')
    assert detail.status_code == 200, detail.text
    assert detail.json()['title'] == 'Synthetic Resolve Show'


@pytest.mark.integration
def test_ensure_movie_integrity_error_recovers_winner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Concurrent insert race: IntegrityError → re-read winner mapping."""
    tmdb_id = 9_000_060
    winner_id = uuid.uuid4()
    lookups = {'n': 0}

    async def _fake_ingest(self: TmdbClient, requested_id: int) -> TmdbMovie:
        return TmdbMovie(
            id=requested_id,
            title='Race Movie',
            overview='concurrent',
            extras={},
        )

    async def _fail_upsert(session: object, movie: TmdbMovie, **kwargs: object):
        del session, movie, kwargs
        raise IntegrityError('INSERT', {}, Exception('uq_external_ids'))

    async def _get_ext(
        session: object,
        *,
        source: str,
        source_namespace: str,
        external_id: str,
    ) -> SimpleNamespace | None:
        del session, source, source_namespace, external_id
        lookups['n'] += 1
        if lookups['n'] == 1:
            return None
        return SimpleNamespace(content_item_id=winner_id)

    monkeypatch.setenv('TMDB_API_KEY', 'test-key-not-real')
    get_settings.cache_clear()
    monkeypatch.setattr(TmdbClient, 'get_movie_for_ingest', _fake_ingest)
    monkeypatch.setattr(metadata_ingest, 'upsert_movie_payload', _fail_upsert)
    monkeypatch.setattr(metadata_repository, 'get_external_id', _get_ext)

    async def _run() -> uuid.UUID:
        async with session_scope() as session:
            client = TmdbClient.from_settings(get_settings())
            return await ensure_movie_from_tmdb(
                session,
                tmdb_id,
                client=client,
            )

    init_db()
    try:
        result = asyncio.run(_run())
    finally:
        asyncio.run(dispose_db())

    assert result == winner_id
    assert lookups['n'] >= 2


@pytest.mark.integration
def test_resolve_rate_limit_returns_429(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Unique trusted IP so Redis-backed RL keys never collide across runs/suite.
    secret = 'test-bff-shared-secret'
    unique_ip = f'203.0.113.{uuid.uuid4().int % 200 + 10}'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('METADATA_RESOLVE_RATE_LIMIT_MAX_PER_IP', '2')
    get_settings.cache_clear()

    headers = {
        'X-Aperture-Client-IP': unique_ip,
        'X-Aperture-BFF-Secret': secret,
    }
    first = api_client.post(
        '/api/v1/movies/resolve',
        json={'tmdb_id': 278},
        headers=headers,
    )
    second = api_client.post(
        '/api/v1/movies/resolve',
        json={'tmdb_id': 278},
        headers=headers,
    )
    third = api_client.post(
        '/api/v1/movies/resolve',
        json={'tmdb_id': 278},
        headers=headers,
    )
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert third.status_code == 429, third.text


def _unique_synthetic_tmdb_id() -> int:
    """High synthetic TMDb id unlikely to collide with fixtures or prior runs."""
    return 2_000_000_000 + (uuid.uuid4().int % 100_000_000)


@pytest.mark.integration
def test_resolve_ingest_rate_limit_returns_429(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Cold resolves share a stricter per-IP ingest bucket than catalog hits."""
    from app.core.cache import init_cache, reset_cache

    secret = 'test-bff-shared-secret'
    unique_ip = f'198.51.100.{uuid.uuid4().int % 200 + 10}'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('METADATA_RESOLVE_RATE_LIMIT_MAX_PER_IP', '100')
    monkeypatch.setenv('METADATA_RESOLVE_INGEST_RATE_LIMIT_MAX_PER_IP', '2')
    monkeypatch.setenv('TMDB_API_KEY', 'test-key-not-real')
    # Isolate from shared Redis peer buckets when REDIS_URL is set in .env.
    monkeypatch.setenv('REDIS_URL', '')
    get_settings.cache_clear()
    reset_cache()
    init_cache('')

    async def _fake_ingest(self: TmdbClient, requested_id: int) -> TmdbMovie:
        return TmdbMovie(
            id=requested_id,
            title=f'Ingest RL {requested_id}',
            overview='rate-limit probe',
            extras={},
        )

    monkeypatch.setattr(TmdbClient, 'get_movie_for_ingest', _fake_ingest)

    headers = {
        'X-Aperture-Client-IP': unique_ip,
        'X-Aperture-BFF-Secret': secret,
    }
    base_id = _unique_synthetic_tmdb_id()
    cold_ids = (base_id, base_id + 1, base_id + 2)
    statuses = [
        api_client.post(
            '/api/v1/movies/resolve',
            json={'tmdb_id': tmdb_id},
            headers=headers,
        ).status_code
        for tmdb_id in cold_ids
    ]
    assert statuses[0] == 200, statuses
    assert statuses[1] == 200, statuses
    assert statuses[2] == 429, statuses


@pytest.mark.integration
def test_resolve_concurrent_coalesce_single_tmdb_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two concurrent cold resolves for the same id share one TMDb fetch."""
    tmdb_id = _unique_synthetic_tmdb_id()
    calls = {'n': 0}
    # Drop any stale completed futures from prior event loops / runs.
    metadata_resolve._resolve_flights.clear()

    async def _fake_ingest(self: TmdbClient, requested_id: int) -> TmdbMovie:
        assert requested_id == tmdb_id
        calls['n'] += 1
        await asyncio.sleep(0.15)
        return TmdbMovie(
            id=requested_id,
            title='Coalesced Resolve Movie',
            overview='single upstream fetch',
            extras={},
        )

    monkeypatch.setenv('TMDB_API_KEY', 'test-key-not-real')
    get_settings.cache_clear()
    monkeypatch.setattr(TmdbClient, 'get_movie_for_ingest', _fake_ingest)

    async def _run() -> tuple[uuid.UUID, uuid.UUID]:
        settings = get_settings()
        async with session_scope() as session_a, session_scope() as session_b:
            results = await asyncio.gather(
                metadata_resolve.resolve_movie_by_tmdb(
                    session_a,
                    settings,
                    tmdb_id,
                    client_ip='203.0.113.50',
                ),
                metadata_resolve.resolve_movie_by_tmdb(
                    session_b,
                    settings,
                    tmdb_id,
                    client_ip='203.0.113.50',
                ),
            )
        return results[0].id, results[1].id

    init_db()
    try:
        id_a, id_b = asyncio.run(_run())
    finally:
        metadata_resolve._resolve_flights.clear()
        asyncio.run(dispose_db())

    assert id_a == id_b
    assert calls['n'] == 1
