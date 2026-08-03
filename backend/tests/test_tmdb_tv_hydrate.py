"""Unit tests for TV season hydration during TMDb ingest fetch."""

from __future__ import annotations

from typing import Any

import pytest
from app.metadata.tmdb.client import (
    TmdbClient,
    TmdbNotFoundError,
    TmdbUnavailableError,
)
from app.metadata.tmdb.dto import TmdbSeason


def _tv_detail(*, season_count: int) -> dict[str, Any]:
    return {
        'id': 99,
        'name': 'Long Show',
        'seasons': [
            {
                'season_number': index,
                'name': f'Season {index}',
                'episode_count': 8,
            }
            for index in range(season_count)
        ],
    }


@pytest.mark.asyncio
async def test_get_tv_for_ingest_keeps_stub_on_season_404(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = TmdbClient('test-key')
    detail = _tv_detail(season_count=1)

    async def fake_get(
        path: str,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        del params
        assert path == '/tv/99'
        return detail

    async def fake_season(tmdb_id: int, season_number: int) -> TmdbSeason:
        del tmdb_id, season_number
        raise TmdbNotFoundError('missing season')

    monkeypatch.setattr(client, '_get', fake_get)
    monkeypatch.setattr(client, 'get_tv_season', fake_season)

    show = await client.get_tv_for_ingest(99)
    assert len(show.seasons) == 1
    assert show.seasons[0].season_number == 0
    assert show.seasons[0].episodes == []
    assert show.seasons[0].name == 'Season 0'


@pytest.mark.asyncio
async def test_get_tv_for_ingest_raises_on_season_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = TmdbClient('test-key')
    detail = _tv_detail(season_count=2)

    async def fake_get(
        path: str,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        del params
        assert path == '/tv/99'
        return detail

    async def fake_season(tmdb_id: int, season_number: int) -> TmdbSeason:
        del tmdb_id
        if season_number == 0:
            return TmdbSeason(
                season_number=0,
                name='Specials',
                episodes=[],
            )
        raise TmdbUnavailableError('TMDb unavailable: HTTP 503')

    monkeypatch.setattr(client, '_get', fake_get)
    monkeypatch.setattr(client, 'get_tv_season', fake_season)

    with pytest.raises(TmdbUnavailableError):
        await client.get_tv_for_ingest(99)


@pytest.mark.asyncio
async def test_get_tv_for_ingest_caps_season_hydration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = TmdbClient('test-key')
    detail = _tv_detail(season_count=30)
    fetch_count = 0

    async def fake_get(
        path: str,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        del params
        assert path == '/tv/99'
        return detail

    async def fake_season(tmdb_id: int, season_number: int) -> TmdbSeason:
        nonlocal fetch_count
        del tmdb_id
        fetch_count += 1
        return TmdbSeason(
            season_number=season_number,
            name=f'Hydrated {season_number}',
            episode_count=1,
            episodes=[
                {
                    'episode_number': 1,
                    'name': 'Pilot',
                },
            ],
        )

    monkeypatch.setattr(client, '_get', fake_get)
    monkeypatch.setattr(client, 'get_tv_season', fake_season)

    show = await client.get_tv_for_ingest(99)
    assert fetch_count == 25
    assert len(show.seasons) == 30
    assert show.seasons[0].name == 'Hydrated 0'
    assert show.seasons[0].episodes
    assert show.seasons[24].name == 'Hydrated 24'
    assert show.seasons[24].episodes
    assert show.seasons[25].name == 'Season 25'
    assert show.seasons[25].episodes == []
    assert show.seasons[-1].name == 'Season 29'
    assert show.seasons[-1].episodes == []
