"""Lazy + batch refresh of lean catalog stubs (Option B / TMDb ToS)."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import nullsfirst, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.core.config import Settings
from app.metadata import repository as metadata_repository
from app.metadata.cache_keys import movie_detail_key, tv_detail_key
from app.metadata.enrichment import lean_extras_for_persist
from app.metadata.models import ContentItem, ExternalId
from app.metadata.tmdb.client import (
    TmdbClient,
    TmdbConfigError,
    TmdbNotFoundError,
    TmdbUnavailableError,
)

logger = logging.getLogger(__name__)

SOURCE_TMDB = 'tmdb'

# Process-local coalesce for concurrent stub refreshes. Futures share a success
# token only — never ORM instances (waiters re-SELECT in their own session).
_stub_flights: dict[tuple[str, uuid.UUID], asyncio.Future[bool]] = {}
_stub_flights_lock = asyncio.Lock()


def reset_stub_refresh_flights() -> None:
    """Clear in-flight stub-refresh coalescing (tests)."""
    global _stub_flights_lock
    _stub_flights.clear()
    _stub_flights_lock = asyncio.Lock()


def _parse_date(value: str | None) -> date | None:
    if value is None or not value.strip():
        return None
    return date.fromisoformat(value.strip()[:10])


def _popularity(value: float | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def stub_is_stale(item: ContentItem, *, max_age_days: int) -> bool:
    """True when lean stub fields should be re-fetched from TMDb."""
    anchor = item.refreshed_at or item.updated_at
    if anchor is None:
        return True
    if anchor.tzinfo is None:
        anchor = anchor.replace(tzinfo=UTC)
    age = datetime.now(UTC) - anchor
    return age >= timedelta(days=max_age_days)


async def refresh_stub_from_tmdb(
    session: AsyncSession,
    *,
    content_item_id: uuid.UUID,
    source_namespace: str,
    client: TmdbClient,
) -> ContentItem | None:
    """Refresh lean stub columns from TMDb; keep extras empty.

    Commits immediately after upsert + ``refreshed_at`` so lazy detail GETs
    persist the refresh. Invalidates full detail Redis keys only — never
    enrichment section keys.

    Returns the upserted item, or ``None`` when mapping/TMDb is missing.
    """
    mapping = await metadata_repository.get_external_id_for_content(
        session,
        source=SOURCE_TMDB,
        source_namespace=source_namespace,
        content_item_id=content_item_id,
    )
    if mapping is None or not mapping.external_id:
        return None
    try:
        tmdb_id = int(mapping.external_id)
    except ValueError:
        return None

    now = datetime.now(UTC)
    if source_namespace == 'movie':
        movie = await client.get_movie_for_stub_refresh(tmdb_id)
        item = await metadata_repository.upsert_movie(
            session,
            source=SOURCE_TMDB,
            external_id=str(movie.id),
            title=movie.title,
            original_title=movie.original_title,
            overview=movie.overview,
            poster_path=movie.poster_path,
            backdrop_path=movie.backdrop_path,
            popularity=_popularity(movie.popularity),
            release_date=_parse_date(movie.release_date),
            runtime_minutes=movie.runtime,
            status=movie.status,
            extras=lean_extras_for_persist(None),
        )
    else:
        show = await client.get_tv_for_stub_refresh(tmdb_id)
        item = await metadata_repository.upsert_tv_show(
            session,
            source=SOURCE_TMDB,
            external_id=str(show.id),
            title=show.name,
            original_title=show.original_name,
            overview=show.overview,
            poster_path=show.poster_path,
            backdrop_path=show.backdrop_path,
            popularity=_popularity(show.popularity),
            first_air_date=_parse_date(show.first_air_date),
            last_air_date=_parse_date(show.last_air_date),
            status=show.status,
            number_of_seasons=show.number_of_seasons,
            number_of_episodes=show.number_of_episodes,
            extras=lean_extras_for_persist(None),
        )
    item.refreshed_at = now
    await session.flush()
    await session.commit()
    cache = get_cache()
    if source_namespace == 'movie':
        await cache.delete(movie_detail_key(content_item_id))
    else:
        await cache.delete(tv_detail_key(content_item_id))
    return item


async def maybe_refresh_stale_stub(
    session: AsyncSession,
    item: ContentItem,
    *,
    source_namespace: str,
    settings: Settings | None,
) -> ContentItem:
    """Best-effort lazy stub refresh when ``refreshed_at`` is past max age.

    Concurrent callers for the same ``(namespace, content_id)`` share one
    TMDb+DB write; waiters re-SELECT after the flight. Errors degrade to the
    original item (no 500).
    """
    if settings is None:
        return item
    if not stub_is_stale(item, max_age_days=settings.metadata_stub_max_age_days):
        return item
    try:
        client = TmdbClient.from_settings(settings)
    except TmdbConfigError:
        return item

    key = (source_namespace, item.id)
    loop = asyncio.get_running_loop()
    async with _stub_flights_lock:
        existing = _stub_flights.get(key)
        if existing is not None:
            waiter: asyncio.Future[bool] = existing
            is_leader = False
        else:
            waiter = loop.create_future()
            _stub_flights[key] = waiter
            is_leader = True

    if not is_leader:
        try:
            await asyncio.shield(waiter)
        except Exception:
            return item
        return await _reload_stub_item(
            session,
            item,
            source_namespace=source_namespace,
        )

    try:
        refreshed = await refresh_stub_from_tmdb(
            session,
            content_item_id=item.id,
            source_namespace=source_namespace,
            client=client,
        )
    except Exception as exc:
        # Broad degrade: unexpected refresh errors must not 500 detail.
        logger.info(
            'lazy stub refresh skipped for %s %s: %s',
            source_namespace,
            item.id,
            exc,
        )
        if not waiter.done():
            waiter.set_result(False)
        return item
    else:
        ok = refreshed is not None
        if not waiter.done():
            waiter.set_result(ok)
        if not ok:
            return item
        return await _reload_stub_item(
            session,
            item,
            source_namespace=source_namespace,
            fallback=refreshed,
        )
    finally:
        async with _stub_flights_lock:
            if _stub_flights.get(key) is waiter:
                del _stub_flights[key]


async def _reload_stub_item(
    session: AsyncSession,
    item: ContentItem,
    *,
    source_namespace: str,
    fallback: ContentItem | None = None,
) -> ContentItem:
    """Re-SELECT stub with relationships after a committed refresh."""
    if source_namespace == 'movie':
        loaded = await metadata_repository.get_movie_by_id(session, item.id)
    else:
        loaded = await metadata_repository.get_tv_by_id(session, item.id)
    if loaded is not None:
        return loaded
    if fallback is not None:
        return fallback
    return item


async def count_stale_stubs(
    session: AsyncSession,
    *,
    settings: Settings,
    limit: int = 50,
) -> int:
    """Count stubs that would be refreshed (for CLI ``--dry-run``)."""
    cutoff = datetime.now(UTC) - timedelta(
        days=settings.metadata_stub_max_age_days,
    )
    result = await session.execute(
        select(ContentItem.id)
        .join(
            ExternalId,
            (ExternalId.content_item_id == ContentItem.id)
            & (ExternalId.source == SOURCE_TMDB)
            & (ExternalId.entity_type == 'content_item')
            & (ExternalId.source_namespace.in_(('movie', 'tv'))),
        )
        .where(
            (ContentItem.refreshed_at.is_(None)) | (ContentItem.refreshed_at < cutoff)
        )
        .order_by(nullsfirst(ContentItem.refreshed_at.asc()))
        .limit(limit)
    )
    return len(result.all())


async def refresh_stale_stubs_batch(
    session: AsyncSession,
    *,
    settings: Settings,
    limit: int = 50,
) -> dict[str, int]:
    """Refresh up to ``limit`` stale stubs (oldest ``refreshed_at`` first)."""
    try:
        client = TmdbClient.from_settings(settings)
    except TmdbConfigError as exc:
        raise RuntimeError(str(exc)) from exc

    cutoff = datetime.now(UTC) - timedelta(
        days=settings.metadata_stub_max_age_days,
    )
    result = await session.execute(
        select(ContentItem, ExternalId)
        .join(
            ExternalId,
            (ExternalId.content_item_id == ContentItem.id)
            & (ExternalId.source == SOURCE_TMDB)
            & (ExternalId.entity_type == 'content_item'),
        )
        .where(
            (ContentItem.refreshed_at.is_(None)) | (ContentItem.refreshed_at < cutoff)
        )
        .order_by(nullsfirst(ContentItem.refreshed_at.asc()))
        .limit(limit)
    )
    rows = result.all()
    counts = {'refreshed': 0, 'failed': 0, 'skipped': 0}
    for item, mapping in rows:
        namespace = mapping.source_namespace
        if namespace not in ('movie', 'tv'):
            counts['skipped'] += 1
            continue
        try:
            refreshed = await refresh_stub_from_tmdb(
                session,
                content_item_id=item.id,
                source_namespace=namespace,
                client=client,
            )
        except (TmdbNotFoundError, TmdbUnavailableError):
            counts['failed'] += 1
            continue
        if refreshed is None:
            counts['skipped'] += 1
        else:
            counts['refreshed'] += 1
    return counts


async def refresh_from_tmdb_changes(
    session: AsyncSession,
    *,
    settings: Settings,
    lookback_days: int = 1,
    dry_run: bool = False,
) -> dict[str, int]:
    """Refresh catalog stubs whose TMDb ids appear in ``/movie|/tv/changes``."""
    try:
        client = TmdbClient.from_settings(settings)
    except TmdbConfigError as exc:
        raise RuntimeError(str(exc)) from exc

    end = date.today()
    start = end - timedelta(days=max(1, lookback_days))
    movie_ids = await client.get_changed_movie_ids(start_date=start, end_date=end)
    tv_ids = await client.get_changed_tv_ids(start_date=start, end_date=end)
    counts = {
        'movie_changes': len(movie_ids),
        'tv_changes': len(tv_ids),
        'refreshed': 0,
        'failed': 0,
        'unknown': 0,
        'would_refresh': 0,
    }

    async def _refresh_known(
        tmdb_ids: list[int],
        namespace: str,
    ) -> None:
        for tmdb_id in tmdb_ids:
            mapping = await metadata_repository.get_external_id(
                session,
                source=SOURCE_TMDB,
                source_namespace=namespace,
                external_id=str(tmdb_id),
            )
            if mapping is None or mapping.content_item_id is None:
                counts['unknown'] += 1
                continue
            if dry_run:
                counts['would_refresh'] += 1
                continue
            try:
                refreshed = await refresh_stub_from_tmdb(
                    session,
                    content_item_id=mapping.content_item_id,
                    source_namespace=namespace,
                    client=client,
                )
            except (TmdbNotFoundError, TmdbUnavailableError):
                counts['failed'] += 1
                continue
            if refreshed is None:
                counts['failed'] += 1
            else:
                counts['refreshed'] += 1

    await _refresh_known(movie_ids, 'movie')
    await _refresh_known(tv_ids, 'tv')
    return counts
