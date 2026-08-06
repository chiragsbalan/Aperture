"""On-demand TMDb season episode hydrate (lazy title-page season tabs)."""

from __future__ import annotations

import asyncio
import uuid
from datetime import date

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.metadata import repository as metadata_repository
from app.metadata.cache_keys import tv_detail_key
from app.metadata.models import Season
from app.metadata.tmdb.client import TmdbClient

SOURCE_TMDB = 'tmdb'

# Per-process coalescing for concurrent cold hydrates of the same season.
_hydrate_flights: dict[tuple[uuid.UUID, int], asyncio.Future[None]] = {}
_hydrate_flights_lock = asyncio.Lock()


def reset_tv_season_hydrate_flights() -> None:
    """Clear in-flight hydrate coalescing (tests)."""
    _hydrate_flights.clear()


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

    Concurrent callers for the same ``(content_item_id, season_number)`` share
    one TMDb fetch; waiters re-read from their own session after the leader
    finishes. Invalidates the TV detail cache on success.
    """
    key = (content_item_id, season_number)
    loop = asyncio.get_running_loop()
    async with _hydrate_flights_lock:
        existing = _hydrate_flights.get(key)
        if existing is not None:
            waiter: asyncio.Future[None] = existing
            is_leader = False
        else:
            waiter = loop.create_future()
            _hydrate_flights[key] = waiter
            is_leader = True

    if not is_leader:
        await asyncio.shield(waiter)
        season = await metadata_repository.get_tv_season_by_number(
            session,
            content_item_id,
            season_number,
        )
        if season is None:
            raise LookupError('tv season not found')
        return season

    try:
        season = await _hydrate_tv_season_episodes_impl(
            session,
            content_item_id=content_item_id,
            season_number=season_number,
            client=client,
            source=source,
        )
    except BaseException as exc:
        if not waiter.done():
            waiter.set_exception(exc)
        raise
    else:
        if not waiter.done():
            waiter.set_result(None)
        return season
    finally:
        async with _hydrate_flights_lock:
            if _hydrate_flights.get(key) is waiter:
                del _hydrate_flights[key]


async def _hydrate_tv_season_episodes_impl(
    session: AsyncSession,
    *,
    content_item_id: uuid.UUID,
    season_number: int,
    client: TmdbClient,
    source: str,
) -> Season:
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

    try:
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
    except IntegrityError as exc:
        # Concurrent hydrate won the unique (season_id, episode_number) race.
        await session.rollback()
        reloaded = await metadata_repository.get_tv_season_by_number(
            session,
            content_item_id,
            season_number,
        )
        if reloaded is not None and reloaded.episodes:
            return reloaded
        raise RuntimeError('season hydrate race unresolved') from exc

    await get_cache().delete(tv_detail_key(content_item_id))

    reloaded = await metadata_repository.get_tv_season_by_number(
        session,
        content_item_id,
        season_number,
    )
    if reloaded is None:
        raise RuntimeError('season missing after hydrate')
    return reloaded
