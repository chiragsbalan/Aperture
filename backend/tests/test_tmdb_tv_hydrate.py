"""Unit tests for stub-only TV ingest fetch (no season fan-out)."""

from __future__ import annotations

from typing import Any

import pytest
from app.metadata.tmdb.client import TmdbClient
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
async def test_get_tv_for_ingest_returns_stubs_without_season_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = TmdbClient('test-key')
    detail = _tv_detail(season_count=30)
    season_calls = 0

    async def fake_get(
        path: str,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        del params
        assert path == '/tv/99'
        return detail

    async def fake_season(tmdb_id: int, season_number: int) -> TmdbSeason:
        nonlocal season_calls
        del tmdb_id, season_number
        season_calls += 1
        raise AssertionError('get_tv_season must not run during ingest')

    monkeypatch.setattr(client, '_get', fake_get)
    monkeypatch.setattr(client, 'get_tv_season', fake_season)

    show = await client.get_tv_for_ingest(99)
    assert season_calls == 0
    assert len(show.seasons) == 30
    assert all(not season.episodes for season in show.seasons)
    assert show.seasons[0].name == 'Season 0'
    assert show.seasons[0].episode_count == 8
    assert show.seasons[-1].name == 'Season 29'


@pytest.mark.asyncio
async def test_get_tv_for_ingest_includes_extras(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = TmdbClient('test-key')

    async def fake_get(
        path: str,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        assert path == '/tv/99'
        assert params is not None
        assert 'recommendations' in params['append_to_response']
        return {
            'id': 99,
            'name': 'Show',
            'seasons': [],
            'recommendations': {
                'results': [
                    {
                        'id': 1,
                        'name': 'Other',
                        'media_type': 'tv',
                    },
                ],
            },
        }

    monkeypatch.setattr(client, '_get', fake_get)
    show = await client.get_tv_for_ingest(99)
    assert show.extras.get('similar')
