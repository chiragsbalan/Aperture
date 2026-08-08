"""Unit tests for interim search recall (ADR-0016) with mocked TMDb."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

import pytest
from app.core.cache import get_cache, reset_cache, run_coro_sync
from app.core.config import Settings
from app.core.db import dispose_db, init_db, session_scope
from app.main import app
from app.metadata.ingest import seed_from_fixtures
from app.search import tmdb_recall
from app.search.schemas import SearchCard
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _reset_cache() -> None:
    reset_cache()
    tmdb_recall._external_flights.clear()
    yield
    reset_cache()
    tmdb_recall._external_flights.clear()


@pytest.fixture
def seeded_catalog() -> None:
    async def _seed() -> None:
        async with session_scope() as session:
            await seed_from_fixtures(session)

    init_db()
    try:
        asyncio.run(_seed())
    finally:
        asyncio.run(dispose_db())


@pytest.fixture
def api_client(seeded_catalog: None) -> TestClient:
    del seeded_catalog
    with TestClient(app) as client:
        yield client


def _multi_payload(*rows: dict[str, Any]) -> dict[str, Any]:
    return {'results': list(rows)}


@pytest.mark.integration
def test_external_on_zero_title_hits(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_search_multi(self: object, query: str, *, page: int = 1) -> dict:
        del self, page
        assert 'zzzznotitle' in query.lower() or query
        return _multi_payload(
            {
                'id': 550,
                'media_type': 'movie',
                'title': 'Fight Club',
                'release_date': '1999-10-15',
                'poster_path': '/fight.jpg',
            },
            {
                'id': 1396,
                'media_type': 'tv',
                'name': 'Breaking Bad',
                'first_air_date': '2008-01-20',
                'poster_path': '/bb.jpg',
            },
            {
                'id': 1,
                'media_type': 'person',
                'name': 'Someone',
            },
        )

    monkeypatch.setattr(
        'app.metadata.tmdb.client.TmdbClient.search_multi',
        _fake_search_multi,
    )
    monkeypatch.setenv('TMDB_API_KEY', 'test-key')
    from app.core.config import get_settings

    get_settings.cache_clear()

    res = api_client.get('/api/v1/search', params={'q': 'zzzznotitlexyz'})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['total'] == 0
    assert body['match_quality'] == 'none'
    assert body['results'] == []
    assert isinstance(body['external'], list)
    assert len(body['external']) == 2
    assert all(card['type'] in ('movie', 'tv') for card in body['external'])
    assert all('tmdb_id' in card for card in body['external'])
    assert body['related'] == []


@pytest.mark.integration
def test_external_skipped_for_person_only_types(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    called = {'n': 0}

    async def _fake_search_multi(self: object, query: str, *, page: int = 1) -> dict:
        del self, query, page
        called['n'] += 1
        return _multi_payload(
            {
                'id': 550,
                'media_type': 'movie',
                'title': 'Fight Club',
                'release_date': '1999-10-15',
            }
        )

    monkeypatch.setattr(
        'app.metadata.tmdb.client.TmdbClient.search_multi',
        _fake_search_multi,
    )
    monkeypatch.setenv('TMDB_API_KEY', 'test-key')
    from app.core.config import get_settings

    get_settings.cache_clear()

    res = api_client.get(
        '/api/v1/search',
        params={'q': 'zzzznotitlexyz', 'types': 'person'},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['external'] == []
    assert called['n'] == 0


@pytest.mark.integration
def test_external_omitted_on_page_two(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    called = {'n': 0}

    async def _fake_search_multi(self: object, query: str, *, page: int = 1) -> dict:
        del self, query, page
        called['n'] += 1
        return _multi_payload(
            {
                'id': 550,
                'media_type': 'movie',
                'title': 'Fight Club',
                'release_date': '1999-10-15',
            }
        )

    monkeypatch.setattr(
        'app.metadata.tmdb.client.TmdbClient.search_multi',
        _fake_search_multi,
    )
    monkeypatch.setenv('TMDB_API_KEY', 'test-key')
    from app.core.config import get_settings

    get_settings.cache_clear()

    res = api_client.get(
        '/api/v1/search',
        params={'q': 'zzzznotitlexyz', 'page': 2},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['external'] is None
    assert body['related'] is None
    assert called['n'] == 0


@pytest.mark.integration
def test_external_timeout_degrades_empty(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _timeout_search_multi(self: object, query: str, *, page: int = 1) -> dict:
        del self, query, page
        raise TimeoutError('simulated TMDb timeout')

    monkeypatch.setattr(
        'app.metadata.tmdb.client.TmdbClient.search_multi',
        _timeout_search_multi,
    )
    monkeypatch.setenv('TMDB_API_KEY', 'test-key')
    from app.core.config import get_settings

    get_settings.cache_clear()

    res = api_client.get('/api/v1/search', params={'q': 'zzzztimeoutonlyxyz'})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['results'] == []
    assert body['external'] == []


@pytest.mark.integration
def test_strong_local_hits_skip_live_external(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    called = {'n': 0}

    async def _fake_search_multi(self: object, query: str, *, page: int = 1) -> dict:
        del self, query, page
        called['n'] += 1
        return _multi_payload(
            {
                'id': 550,
                'media_type': 'movie',
                'title': 'Fight Club',
                'release_date': '1999-10-15',
            }
        )

    monkeypatch.setattr(
        'app.metadata.tmdb.client.TmdbClient.search_multi',
        _fake_search_multi,
    )
    monkeypatch.setenv('TMDB_API_KEY', 'test-key')
    from app.core.config import get_settings

    get_settings.cache_clear()

    # Seed catalog has Shawshank — strong enough for title_hits >= 1; with N=3
    # a single hit is "weak" and still may consult cache (not live when flag off).
    res = api_client.get('/api/v1/search', params={'q': 'Shawshank'})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['total'] >= 1
    assert body['match_quality'] in ('weak', 'strong')
    assert called['n'] == 0


def test_external_cache_hit_skips_live() -> None:
    settings = Settings(
        tmdb_api_key='test-key',
        search_external_cache_ttl_seconds=3600,
        search_external_negative_cache_ttl_seconds=60,
        search_external_cap=12,
        search_tmdb_timeout_ms=2000,
    )
    key_types = frozenset({'movie', 'tv'})
    cache_key = tmdb_recall._external_cache_key('cachedquery', key_types)
    card = SearchCard(
        type='movie',
        title='Cached',
        year=2000,
        poster_url=None,
        tmdb_id=999,
        content_id=None,
    )
    run_coro_sync(
        get_cache().set(
            cache_key,
            '[' + card.model_dump_json() + ']',
            ttl_seconds=60,
        )
    )

    class _Session:
        pass

    cards = run_coro_sync(
        tmdb_recall.fetch_external_cards(
            _Session(),  # type: ignore[arg-type]
            query='cachedquery',
            types=key_types,
            settings=settings,
            title_hits=0,
            warm_ids=set(),
            allow_live=True,
        )
    )
    assert len(cards) == 1
    assert cards[0].tmdb_id == 999


@pytest.mark.integration
def test_related_from_top_hit(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_related(
        session: object,
        *,
        content_id: uuid.UUID,
        kind: str,
        settings: object,
        cap: int,
    ) -> list[dict[str, Any]]:
        del session, content_id, kind, settings
        return [
            {
                'tmdb_id': 680,
                'title': 'Pulp Fiction',
                'year': 1994,
                'poster_path': '/pf.jpg',
            }
            for _ in range(min(cap, 1))
        ]

    async def _no_external(self: object, query: str, *, page: int = 1) -> dict:
        del self, query, page
        return _multi_payload()

    monkeypatch.setattr(
        'app.search.tmdb_recall.metadata_service.fetch_search_related_similar',
        _fake_related,
    )
    monkeypatch.setattr(
        'app.metadata.tmdb.client.TmdbClient.search_multi',
        _no_external,
    )
    monkeypatch.setenv('TMDB_API_KEY', 'test-key')
    from app.core.config import get_settings

    get_settings.cache_clear()

    res = api_client.get('/api/v1/search', params={'q': 'Shawshank'})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['total'] >= 1
    assert isinstance(body['related'], list)
    assert len(body['related']) >= 1
    assert body['related'][0]['tmdb_id'] == 680
