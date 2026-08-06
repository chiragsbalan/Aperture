"""On-demand TMDb season episode hydrate (lazy title-page season tabs)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.metadata import repository as metadata_repository
from app.metadata.cache_keys import tv_detail_key
from app.metadata.models import Season
from app.metadata.tmdb.client import TmdbClient

SOURCE_TMDB = 'tmdb'


def _parse_date(value: str | None) -> date | None:
    if value is None or not value.strip():
        return None
    return date.fromisoformat(value.strip())


async def hydrate_tv_season_episodes(
    session: AsyncSession,
    *,
    content_item_id: uuid.UUID,
    season_number: int,
    client: TmdbClient,
    source: str = SOURCE_TMDB,
) -> Season:
    """Fetch one season from TMDb and persist its episodes (batch upsert).

    Invalidates the TV detail cache so the next detail GET can embed the
    preferred season's episodes when present.
    """
    mapping = await metadata_repository.get_external_id_for_content(
        session,
        source=source,
        source_namespace='tv',
        content_item_id=content_item_id,
    )
    if mapping is None:
        raise LookupError('tv show has no TMDb external id')

    tmdb_id = int(mapping.external_id)
    season_payload = await client.get_tv_season(tmdb_id, season_number)
    season = await metadata_repository.get_tv_season_by_number(
        session,
        content_item_id,
        season_number,
    )
    if season is None:
        raise LookupError('tv season not found')

    episode_count = season_payload.episode_count
    if episode_count is None and season_payload.episodes:
        episode_count = len(season_payload.episodes)

    if season_payload.name is not None:
        season.name = season_payload.name
    if season_payload.overview is not None:
        season.overview = season_payload.overview
    air_date = _parse_date(season_payload.air_date)
    if air_date is not None:
        season.air_date = air_date
    if episode_count is not None:
        season.episode_count = episode_count
    if season_payload.poster_path is not None:
        season.poster_path = season_payload.poster_path

    await metadata_repository.upsert_episodes_batch(
        session,
        season_id=season.id,
        episodes=[
            {
                'episode_number': episode_payload.episode_number,
                'name': episode_payload.name,
                'overview': episode_payload.overview,
                'air_date': _parse_date(episode_payload.air_date),
                'runtime_minutes': episode_payload.runtime,
                'still_path': episode_payload.still_path,
            }
            for episode_payload in season_payload.episodes
        ],
    )
    await session.commit()
    await get_cache().delete(tv_detail_key(content_item_id))

    reloaded = await metadata_repository.get_tv_season_by_number(
        session,
        content_item_id,
        season_number,
    )
    if reloaded is None:
        raise RuntimeError('season missing after hydrate')
    return reloaded
