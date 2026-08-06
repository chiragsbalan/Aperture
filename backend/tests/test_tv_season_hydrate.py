"""Unit tests for on-demand TV season hydrate + service backfill."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.core.config import Settings
from app.metadata import service as metadata_service
from app.metadata.service import CatalogUnavailableError
from app.metadata.tmdb.client import (
    TmdbConfigError,
    TmdbNotFoundError,
    TmdbUnavailableError,
)
from app.metadata.tmdb.dto import TmdbSeason
from app.metadata.tv_season_hydrate import hydrate_tv_season_episodes


def _settings() -> Settings:
    return Settings(
        database_url='postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
        jwt_secret='test-jwt-secret-not-for-production-use-32b',
        tmdb_api_key='test-key',
        metadata_resolve_ingest_rate_limit_max_per_ip=100,
    )


@pytest.mark.asyncio
async def test_get_tv_season_detail_hydrates_stub(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    content_id = uuid.uuid4()
    stub = SimpleNamespace(
        id=uuid.uuid4(),
        season_number=1,
        name='Season 1',
        overview=None,
        air_date=None,
        episode_count=2,
        poster_path=None,
        episodes=[],
    )
    hydrated = SimpleNamespace(
        id=stub.id,
        season_number=1,
        name='Season 1',
        overview=None,
        air_date=None,
        episode_count=2,
        poster_path=None,
        episodes=[
            SimpleNamespace(
                id=uuid.uuid4(),
                episode_number=1,
                name='Pilot',
                overview=None,
                air_date=None,
                runtime_minutes=42,
                still_path=None,
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                episode_number=2,
                name='Cat',
                overview=None,
                air_date=None,
                runtime_minutes=45,
                still_path=None,
            ),
        ],
    )
    loads = {'n': 0}

    async def fake_get_season(
        session: Any,
        content_item_id: uuid.UUID,
        season_number: int,
    ) -> Any:
        del session, content_item_id, season_number
        loads['n'] += 1
        return stub if loads['n'] == 1 else hydrated

    async def fake_hydrate(session: Any, **kwargs: Any) -> Any:
        del session, kwargs
        return hydrated

    async def fake_rl(*args: Any, **kwargs: Any) -> None:
        del args, kwargs

    monkeypatch.setattr(
        metadata_service.metadata_repository,
        'get_tv_season_by_number',
        fake_get_season,
    )
    monkeypatch.setattr(
        metadata_service,
        'hydrate_tv_season_episodes',
        fake_hydrate,
    )
    monkeypatch.setattr(
        metadata_service,
        'enforce_season_hydrate_rate_limit',
        fake_rl,
    )
    monkeypatch.setattr(
        metadata_service,
        'TmdbClient',
        SimpleNamespace(from_settings=lambda settings: object()),
    )

    detail = await metadata_service.get_tv_season_detail(
        MagicMock(),
        content_id,
        1,
        settings=_settings(),
        client_ip='203.0.113.10',
    )
    assert detail.season_number == 1
    assert len(detail.episodes) == 2
    assert detail.episodes[0].name == 'Pilot'


@pytest.mark.asyncio
async def test_get_tv_season_detail_unavailable_on_tmdb_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub = SimpleNamespace(
        id=uuid.uuid4(),
        season_number=1,
        name='Season 1',
        overview=None,
        air_date=None,
        episode_count=8,
        poster_path=None,
        episodes=[],
    )

    async def fake_get_season(*args: Any, **kwargs: Any) -> Any:
        del args, kwargs
        return stub

    async def fake_hydrate(session: Any, **kwargs: Any) -> Any:
        del session, kwargs
        raise TmdbUnavailableError('TMDb unavailable: HTTP 503')

    async def fake_rl(*args: Any, **kwargs: Any) -> None:
        del args, kwargs

    monkeypatch.setattr(
        metadata_service.metadata_repository,
        'get_tv_season_by_number',
        fake_get_season,
    )
    monkeypatch.setattr(
        metadata_service,
        'hydrate_tv_season_episodes',
        fake_hydrate,
    )
    monkeypatch.setattr(
        metadata_service,
        'enforce_season_hydrate_rate_limit',
        fake_rl,
    )
    monkeypatch.setattr(
        metadata_service,
        'TmdbClient',
        SimpleNamespace(from_settings=lambda settings: object()),
    )

    with pytest.raises(CatalogUnavailableError) as exc_info:
        await metadata_service.get_tv_season_detail(
            MagicMock(),
            uuid.uuid4(),
            1,
            settings=_settings(),
        )
    assert 'temporarily unavailable' in str(exc_info.value)


@pytest.mark.asyncio
async def test_get_tv_season_detail_unavailable_on_tmdb_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub = SimpleNamespace(
        id=uuid.uuid4(),
        season_number=1,
        name='Season 1',
        overview=None,
        air_date=None,
        episode_count=8,
        poster_path=None,
        episodes=[],
    )

    async def fake_get_season(*args: Any, **kwargs: Any) -> Any:
        del args, kwargs
        return stub

    async def fake_hydrate(session: Any, **kwargs: Any) -> Any:
        del session, kwargs
        raise TmdbNotFoundError('missing')

    async def fake_rl(*args: Any, **kwargs: Any) -> None:
        del args, kwargs

    monkeypatch.setattr(
        metadata_service.metadata_repository,
        'get_tv_season_by_number',
        fake_get_season,
    )
    monkeypatch.setattr(
        metadata_service,
        'hydrate_tv_season_episodes',
        fake_hydrate,
    )
    monkeypatch.setattr(
        metadata_service,
        'enforce_season_hydrate_rate_limit',
        fake_rl,
    )
    monkeypatch.setattr(
        metadata_service,
        'TmdbClient',
        SimpleNamespace(from_settings=lambda settings: object()),
    )

    with pytest.raises(CatalogUnavailableError):
        await metadata_service.get_tv_season_detail(
            MagicMock(),
            uuid.uuid4(),
            1,
            settings=_settings(),
        )


@pytest.mark.asyncio
async def test_get_tv_season_detail_unavailable_without_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stub = SimpleNamespace(
        id=uuid.uuid4(),
        season_number=1,
        name='Season 1',
        overview=None,
        air_date=None,
        episode_count=8,
        poster_path=None,
        episodes=[],
    )

    async def fake_get_season(*args: Any, **kwargs: Any) -> Any:
        del args, kwargs
        return stub

    async def fake_rl(*args: Any, **kwargs: Any) -> None:
        del args, kwargs

    def boom(settings: Settings) -> Any:
        del settings
        raise TmdbConfigError('missing key')

    monkeypatch.setattr(
        metadata_service.metadata_repository,
        'get_tv_season_by_number',
        fake_get_season,
    )
    monkeypatch.setattr(
        metadata_service,
        'enforce_season_hydrate_rate_limit',
        fake_rl,
    )
    monkeypatch.setattr(
        metadata_service,
        'TmdbClient',
        SimpleNamespace(from_settings=boom),
    )

    with pytest.raises(CatalogUnavailableError):
        await metadata_service.get_tv_season_detail(
            MagicMock(),
            uuid.uuid4(),
            1,
            settings=_settings(),
        )


@pytest.mark.asyncio
async def test_hydrate_coalesces_concurrent_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    content_id = uuid.uuid4()
    season_id = uuid.uuid4()
    calls = {'n': 0}
    season_row = SimpleNamespace(
        id=season_id,
        season_number=1,
        name='S1',
        overview=None,
        air_date=None,
        episode_count=1,
        poster_path=None,
        episodes=[
            SimpleNamespace(
                id=uuid.uuid4(),
                episode_number=1,
                name='Pilot',
                overview=None,
                air_date=None,
                runtime_minutes=40,
                still_path=None,
            ),
        ],
    )

    async def fake_mapping(*args: Any, **kwargs: Any) -> Any:
        del args, kwargs
        return SimpleNamespace(external_id='99')

    async def fake_get_season(*args: Any, **kwargs: Any) -> Any:
        del args, kwargs
        return season_row

    async def fake_get_tv_season(tmdb_id: int, season_number: int) -> TmdbSeason:
        del tmdb_id, season_number
        calls['n'] += 1
        await asyncio_sleep_brief()
        return TmdbSeason(
            season_number=1,
            name='S1',
            episode_count=1,
            episodes=[{'episode_number': 1, 'name': 'Pilot'}],
        )

    async def asyncio_sleep_brief() -> None:
        import asyncio

        await asyncio.sleep(0.05)

    monkeypatch.setattr(
        'app.metadata.tv_season_hydrate.metadata_repository.get_external_id_for_content',
        fake_mapping,
    )
    monkeypatch.setattr(
        'app.metadata.tv_season_hydrate.metadata_repository.get_tv_season_by_number',
        fake_get_season,
    )
    monkeypatch.setattr(
        'app.metadata.tv_season_hydrate.metadata_repository.upsert_episodes_batch',
        AsyncMock(),
    )
    monkeypatch.setattr(
        'app.metadata.tv_season_hydrate.get_cache',
        lambda: SimpleNamespace(delete=AsyncMock()),
    )

    client = SimpleNamespace(get_tv_season=fake_get_tv_season)
    session = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()

    import asyncio

    results = await asyncio.gather(
        hydrate_tv_season_episodes(
            session,
            content_item_id=content_id,
            season_number=1,
            client=client,  # type: ignore[arg-type]
        ),
        hydrate_tv_season_episodes(
            session,
            content_item_id=content_id,
            season_number=1,
            client=client,  # type: ignore[arg-type]
        ),
    )
    assert calls['n'] == 1
    assert all(r.episodes for r in results)
