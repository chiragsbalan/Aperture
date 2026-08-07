"""Unit tests for TMDb extras curation and Option B lean projection."""

from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock

import pytest
from app.core.cache import get_cache, reset_cache
from app.core.config import Settings
from app.metadata import service as metadata_service
from app.metadata.cache_keys import movie_enrichment_key
from app.metadata.enrichment import (
    build_extras_from_tmdb_payload,
    extras_need_live_enrichment,
    lean_extras_for_persist,
    merge_enrichment_extras,
)
from app.metadata.tmdb import client as tmdb_client


def test_tv_extras_include_networks_and_episode_runtime() -> None:
    extras = build_extras_from_tmdb_payload(
        {
            'networks': [
                {'id': 174, 'name': 'AMC', 'origin_country': 'US'},
            ],
            'episode_run_time': [47, 58],
            'production_companies': [
                {'id': 1, 'name': 'High Bridge', 'origin_country': 'US'},
            ],
            'content_ratings': {
                'results': [
                    {'iso_3166_1': 'US', 'rating': 'TV-MA'},
                ],
            },
        },
        kind='tv',
    )

    assert extras['networks'] == [
        {'id': 174, 'name': 'AMC', 'origin_country': 'US'},
    ]
    assert extras['episode_runtime_minutes'] == 47
    assert extras['studios'][0]['name'] == 'High Bridge'
    assert extras['releases'][0]['certification'] == 'TV-MA'


def test_movie_extras_omit_networks() -> None:
    extras = build_extras_from_tmdb_payload(
        {
            'networks': [{'id': 1, 'name': 'Should ignore'}],
            'episode_run_time': [47],
            'production_companies': [{'id': 2, 'name': 'Studio'}],
        },
        kind='movie',
    )

    assert extras['networks'] == []
    assert extras['episode_runtime_minutes'] is None
    assert extras['studios'][0]['name'] == 'Studio'


def test_extras_cap_studios_networks_and_tv_releases() -> None:
    extras = build_extras_from_tmdb_payload(
        {
            'production_companies': [
                {'id': i, 'name': f'Studio {i}', 'origin_country': 'US'}
                for i in range(1, 25)
            ],
            'networks': [
                {'id': i, 'name': f'Network {i}', 'origin_country': 'US'}
                for i in range(1, 20)
            ],
            'content_ratings': {
                'results': [
                    {'iso_3166_1': f'C{i:02d}', 'rating': f'R{i}'} for i in range(1, 40)
                ],
            },
        },
        kind='tv',
    )

    assert len(extras['studios']) == 16
    assert extras['studios'][0]['name'] == 'Studio 1'
    assert extras['studios'][-1]['name'] == 'Studio 16'
    assert len(extras['networks']) == 12
    assert extras['networks'][0]['name'] == 'Network 1'
    assert extras['networks'][-1]['name'] == 'Network 12'
    assert len(extras['releases']) == 24
    assert extras['releases'][0]['country'] == 'C01'
    assert extras['releases'][-1]['country'] == 'C24'


def test_lean_extras_for_persist_is_always_empty() -> None:
    full = build_extras_from_tmdb_payload(
        {
            'tagline': 'Hope',
            'genres': [{'id': 18, 'name': 'Drama'}],
            'vote_average': 8.2,
            'vote_count': 100,
            'watch/providers': {
                'results': {
                    'US': {
                        'link': 'https://example.test',
                        'flatrate': [
                            {
                                'provider_id': 8,
                                'provider_name': 'Netflix',
                                'logo_path': '/n.png',
                            }
                        ],
                    }
                }
            },
            'recommendations': {
                'results': [
                    {
                        'id': 1,
                        'title': 'Other',
                        'release_date': '1994-01-01',
                        'poster_path': '/o.jpg',
                    }
                ]
            },
        },
        kind='movie',
    )
    assert lean_extras_for_persist(full) == {}
    assert extras_need_live_enrichment({}) is True
    assert extras_need_live_enrichment(full) is False
    # Legacy fat chrome without votes still needs a live enrich pass.
    assert (
        extras_need_live_enrichment(
            {'tagline': 'Hope', 'genres': [{'id': 18, 'name': 'Drama'}]},
        )
        is True
    )


def test_merge_enrichment_extras_overlays_chrome_fields() -> None:
    base: dict = {}
    overlay = {
        'tagline': 'Hope',
        'genres': [{'id': 18, 'name': 'Drama'}],
        'watch_providers': {'US': {'flatrate': [{'provider_name': 'Netflix'}]}},
        'similar': [{'tmdb_id': 1, 'title': 'Other'}],
        'tmdb_vote_average': 8.2,
        'tmdb_vote_count': 500,
    }
    merged = merge_enrichment_extras(base, overlay)
    assert merged['tagline'] == 'Hope'
    assert merged['genres'][0]['name'] == 'Drama'
    assert merged['watch_providers']['US']['flatrate'][0]['provider_name'] == 'Netflix'
    assert merged['similar'][0]['title'] == 'Other'
    assert merged['tmdb_vote_average'] == 8.2
    assert merged['tmdb_vote_count'] == 500


def test_movie_enrich_append_includes_meta_fields() -> None:
    append = tmdb_client._MOVIE_ENRICH_APPEND
    assert 'keywords' in append
    assert 'release_dates' in append
    assert 'alternative_titles' in append
    assert 'recommendations' in append
    assert 'watch/providers' in append


def test_shared_tmdb_client_disables_redirect_follow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created: dict[str, object] = {}

    class _FakeAsyncClient:
        def __init__(self, **kwargs: object) -> None:
            created.update(kwargs)
            self.is_closed = False
            self.follow_redirects = kwargs.get('follow_redirects', True)

    monkeypatch.setattr(tmdb_client.httpx, 'AsyncClient', _FakeAsyncClient)
    tmdb_client.reset_shared_tmdb_client()

    async def _build() -> None:
        client = await tmdb_client._shared_client()
        assert created.get('follow_redirects') is False
        assert client.follow_redirects is False

    import asyncio

    asyncio.run(_build())
    tmdb_client.reset_shared_tmdb_client()


@pytest.mark.asyncio
async def test_negative_enrichment_cache_skips_live_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reset_cache()
    metadata_service.reset_enrichment_flights()
    content_id = uuid.uuid4()
    settings = Settings(
        database_url='postgresql+asyncpg://aperture:aperture@127.0.0.1:5432/aperture',
        jwt_secret='test-jwt-secret-not-for-production-use-32b',
        tmdb_api_key='test-key',
        metadata_enrichment_negative_cache_ttl_seconds=60,
    )
    key = movie_enrichment_key(content_id)
    await get_cache().set(key, json.dumps({'_neg': True}), ttl_seconds=60)

    live = AsyncMock(return_value={'tagline': 'should not run'})
    monkeypatch.setattr(metadata_service, '_live_enrichment_extras', live)

    extras = await metadata_service._resolve_extras_doc(
        AsyncMock(),
        content_item_id=content_id,
        source_namespace='movie',
        stored_extras={},
        settings=settings,
        enrichment_extras=None,
    )
    assert extras == {}
    live.assert_not_awaited()


@pytest.mark.asyncio
async def test_enrichment_failure_writes_negative_sentinel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reset_cache()
    metadata_service.reset_enrichment_flights()
    content_id = uuid.uuid4()
    settings = Settings(
        database_url='postgresql+asyncpg://aperture:aperture@127.0.0.1:5432/aperture',
        jwt_secret='test-jwt-secret-not-for-production-use-32b',
        tmdb_api_key='test-key',
        metadata_enrichment_negative_cache_ttl_seconds=60,
        metadata_enrichment_cache_ttl_seconds=3600,
    )
    monkeypatch.setattr(
        metadata_service,
        '_live_enrichment_extras',
        AsyncMock(return_value=None),
    )
    extras = await metadata_service._resolve_extras_doc(
        AsyncMock(),
        content_item_id=content_id,
        source_namespace='movie',
        stored_extras={},
        settings=settings,
        enrichment_extras=None,
    )
    assert extras == {}
    raw = await get_cache().get(movie_enrichment_key(content_id))
    assert raw is not None
    assert json.loads(raw) == {'_neg': True}
