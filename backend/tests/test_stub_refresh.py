"""Unit tests for lean stub staleness helpers and refresh hardening."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.core.cache import get_cache, reset_cache
from app.core.config import Settings
from app.metadata.cache_keys import (
    movie_detail_key,
    movie_enrichment_key,
    tv_detail_key,
    tv_enrichment_key,
)
from app.metadata.stub_refresh import (
    maybe_refresh_stale_stub,
    refresh_stub_from_tmdb,
    reset_stub_refresh_flights,
    stub_is_stale,
)
from app.metadata.tmdb.client import TmdbUnavailableError


def test_stub_is_stale_when_refreshed_at_missing() -> None:
    item = SimpleNamespace(refreshed_at=None, updated_at=None)
    assert stub_is_stale(item, max_age_days=150) is True


def test_stub_is_fresh_within_max_age() -> None:
    now = datetime.now(UTC)
    item = SimpleNamespace(
        refreshed_at=now - timedelta(days=10),
        updated_at=now - timedelta(days=200),
    )
    assert stub_is_stale(item, max_age_days=150) is False


def test_stub_is_stale_past_max_age() -> None:
    now = datetime.now(UTC)
    item = SimpleNamespace(
        refreshed_at=now - timedelta(days=160),
        updated_at=now,
    )
    assert stub_is_stale(item, max_age_days=150) is True


@pytest.mark.asyncio
async def test_refresh_stub_commits_and_skips_enrichment_key_delete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reset_cache()
    content_id = uuid.uuid4()
    session = AsyncMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()

    mapping = SimpleNamespace(external_id='278')
    movie = SimpleNamespace(
        id=278,
        title='Shawshank',
        original_title='The Shawshank Redemption',
        overview='Hope',
        poster_path='/p.jpg',
        backdrop_path='/b.jpg',
        popularity=10.0,
        release_date='1994-09-23',
        runtime=142,
        status='Released',
    )
    item = SimpleNamespace(id=content_id, refreshed_at=None)

    monkeypatch.setattr(
        'app.metadata.stub_refresh.metadata_repository.get_external_id_for_content',
        AsyncMock(return_value=mapping),
    )
    monkeypatch.setattr(
        'app.metadata.stub_refresh.metadata_repository.upsert_movie',
        AsyncMock(return_value=item),
    )

    client = MagicMock()
    client.get_movie_for_stub_refresh = AsyncMock(return_value=movie)
    client.get_movie = AsyncMock(side_effect=AssertionError('use lean stub path'))

    cache = get_cache()
    detail_key = movie_detail_key(content_id)
    enrich_key = movie_enrichment_key(content_id)
    await cache.set(detail_key, '{"ok":true}', ttl_seconds=60)
    await cache.set(enrich_key, '{"tagline":"Hope"}', ttl_seconds=60)

    result = await refresh_stub_from_tmdb(
        session,
        content_item_id=content_id,
        source_namespace='movie',
        client=client,
    )

    assert result is item
    session.commit.assert_awaited()
    assert await cache.get(detail_key) is None
    assert await cache.get(enrich_key) == '{"tagline":"Hope"}'
    client.get_movie_for_stub_refresh.assert_awaited_once_with(278)
    client.get_movie.assert_not_called()


@pytest.mark.asyncio
async def test_maybe_refresh_degrades_on_unexpected_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reset_stub_refresh_flights()
    now = datetime.now(UTC)
    item = SimpleNamespace(
        id=uuid.uuid4(),
        refreshed_at=now - timedelta(days=200),
        updated_at=now,
        movie=object(),
    )
    settings = Settings(
        database_url='postgresql+asyncpg://aperture:aperture@127.0.0.1:5432/aperture',
        jwt_secret='test-jwt-secret-not-for-production-use-32b',
        tmdb_api_key='test-key',
        metadata_stub_max_age_days=150,
    )
    monkeypatch.setattr(
        'app.metadata.stub_refresh.TmdbClient.from_settings',
        MagicMock(return_value=MagicMock()),
    )
    monkeypatch.setattr(
        'app.metadata.stub_refresh.refresh_stub_from_tmdb',
        AsyncMock(side_effect=RuntimeError('boom')),
    )
    session = AsyncMock()
    out = await maybe_refresh_stale_stub(
        session,
        item,
        source_namespace='movie',
        settings=settings,
    )
    assert out is item


@pytest.mark.asyncio
async def test_stub_refresh_coalesce_shares_success_token_not_orm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reset_stub_refresh_flights()
    content_id = uuid.uuid4()
    now = datetime.now(UTC)
    stale = SimpleNamespace(
        id=content_id,
        refreshed_at=now - timedelta(days=200),
        updated_at=now,
        movie=object(),
    )
    settings = Settings(
        database_url='postgresql+asyncpg://aperture:aperture@127.0.0.1:5432/aperture',
        jwt_secret='test-jwt-secret-not-for-production-use-32b',
        tmdb_api_key='test-key',
        metadata_stub_max_age_days=150,
    )

    started = asyncio.Event()
    release = asyncio.Event()
    calls = {'n': 0}

    async def _slow_refresh(*_args, **_kwargs):
        calls['n'] += 1
        started.set()
        await release.wait()
        return SimpleNamespace(id=content_id, refreshed_at=now, movie=object())

    reloaded = SimpleNamespace(
        id=content_id,
        refreshed_at=now,
        movie=object(),
    )
    monkeypatch.setattr(
        'app.metadata.stub_refresh.TmdbClient.from_settings',
        MagicMock(return_value=MagicMock()),
    )
    monkeypatch.setattr(
        'app.metadata.stub_refresh.refresh_stub_from_tmdb',
        _slow_refresh,
    )
    monkeypatch.setattr(
        'app.metadata.stub_refresh.metadata_repository.get_movie_by_id',
        AsyncMock(return_value=reloaded),
    )

    session_a = AsyncMock()
    session_b = AsyncMock()

    async def _leader() -> object:
        return await maybe_refresh_stale_stub(
            session_a,
            stale,
            source_namespace='movie',
            settings=settings,
        )

    async def _waiter() -> object:
        await started.wait()
        return await maybe_refresh_stale_stub(
            session_b,
            stale,
            source_namespace='movie',
            settings=settings,
        )

    leader_task = asyncio.create_task(_leader())
    waiter_task = asyncio.create_task(_waiter())
    await started.wait()
    release.set()
    leader_out, waiter_out = await asyncio.gather(leader_task, waiter_task)

    assert calls['n'] == 1
    assert leader_out is reloaded
    assert waiter_out is reloaded


@pytest.mark.asyncio
async def test_refresh_tv_stub_skips_enrichment_key_delete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reset_cache()
    content_id = uuid.uuid4()
    session = AsyncMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    mapping = SimpleNamespace(external_id='1396')
    show = SimpleNamespace(
        id=1396,
        name='Breaking Bad',
        original_name='Breaking Bad',
        overview='…',
        poster_path='/p.jpg',
        backdrop_path='/b.jpg',
        popularity=10.0,
        first_air_date='2008-01-20',
        last_air_date='2013-09-29',
        status='Ended',
        number_of_seasons=5,
        number_of_episodes=62,
    )
    item = SimpleNamespace(id=content_id, refreshed_at=None)
    monkeypatch.setattr(
        'app.metadata.stub_refresh.metadata_repository.get_external_id_for_content',
        AsyncMock(return_value=mapping),
    )
    monkeypatch.setattr(
        'app.metadata.stub_refresh.metadata_repository.upsert_tv_show',
        AsyncMock(return_value=item),
    )
    client = MagicMock()
    client.get_tv_for_stub_refresh = AsyncMock(return_value=show)
    cache = get_cache()
    await cache.set(tv_detail_key(content_id), '{}', ttl_seconds=60)
    await cache.set(tv_enrichment_key(content_id), '{"networks":[]}', ttl_seconds=60)

    await refresh_stub_from_tmdb(
        session,
        content_item_id=content_id,
        source_namespace='tv',
        client=client,
    )
    assert await cache.get(tv_detail_key(content_id)) is None
    assert await cache.get(tv_enrichment_key(content_id)) == '{"networks":[]}'


@pytest.mark.asyncio
async def test_maybe_refresh_degrades_on_tmdb_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reset_stub_refresh_flights()
    now = datetime.now(UTC)
    item = SimpleNamespace(
        id=uuid.uuid4(),
        refreshed_at=now - timedelta(days=200),
        updated_at=now,
    )
    settings = Settings(
        database_url='postgresql+asyncpg://aperture:aperture@127.0.0.1:5432/aperture',
        jwt_secret='test-jwt-secret-not-for-production-use-32b',
        tmdb_api_key='test-key',
        metadata_stub_max_age_days=150,
    )
    monkeypatch.setattr(
        'app.metadata.stub_refresh.TmdbClient.from_settings',
        MagicMock(return_value=MagicMock()),
    )
    monkeypatch.setattr(
        'app.metadata.stub_refresh.refresh_stub_from_tmdb',
        AsyncMock(side_effect=TmdbUnavailableError('down')),
    )
    out = await maybe_refresh_stale_stub(
        AsyncMock(),
        item,
        source_namespace='movie',
        settings=settings,
    )
    assert out is item
