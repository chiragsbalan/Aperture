"""On-click TMDb resolve / ingest (kept out of read-only service)."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.core.config import Settings
from app.metadata import ingest as metadata_ingest
from app.metadata import repository as metadata_repository
from app.metadata import service as metadata_service
from app.metadata.cache_keys import movie_detail_key, tv_detail_key
from app.metadata.rate_limit import enforce_resolve_ingest_rate_limit
from app.metadata.schemas import ResolveByTmdbResponse
from app.metadata.service import CatalogNotFoundError
from app.metadata.tmdb.client import (
    TmdbClient,
    TmdbConfigError,
    TmdbNotFoundError,
    TmdbUnavailableError,
)

# Per-process coalescing for concurrent cold resolves of the same TMDb id.
_resolve_flights: dict[tuple[str, int], asyncio.Future[uuid.UUID]] = {}
_resolve_flights_lock = asyncio.Lock()


class CatalogUnavailableError(Exception):
    """Catalog resolve cannot proceed (e.g. TMDb not configured / upstream)."""


async def resolve_movie_by_tmdb(
    session: AsyncSession,
    settings: Settings,
    tmdb_id: int,
    *,
    client_ip: str | None,
) -> ResolveByTmdbResponse:
    """Lookup or ingest a movie by TMDb id; return canonical id."""
    mapping = await metadata_repository.get_external_id(
        session,
        source='tmdb',
        source_namespace='movie',
        external_id=str(tmdb_id),
    )
    if mapping is not None and mapping.content_item_id is not None:
        return ResolveByTmdbResponse(id=mapping.content_item_id, type='movie')

    content_id = await _coalesce_ingest(
        ('movie', tmdb_id),
        lambda: _ingest_movie(
            session,
            settings,
            tmdb_id,
            client_ip=client_ip,
        ),
    )
    return ResolveByTmdbResponse(id=content_id, type='movie')


async def resolve_tv_by_tmdb(
    session: AsyncSession,
    settings: Settings,
    tmdb_id: int,
    *,
    client_ip: str | None,
) -> ResolveByTmdbResponse:
    """Lookup or ingest a TV show by TMDb id; return canonical id."""
    mapping = await metadata_repository.get_external_id(
        session,
        source='tmdb',
        source_namespace='tv',
        external_id=str(tmdb_id),
    )
    if mapping is not None and mapping.content_item_id is not None:
        return ResolveByTmdbResponse(
            id=mapping.content_item_id,
            type='tv_show',
        )

    content_id = await _coalesce_ingest(
        ('tv', tmdb_id),
        lambda: _ingest_tv(
            session,
            settings,
            tmdb_id,
            client_ip=client_ip,
        ),
    )
    return ResolveByTmdbResponse(id=content_id, type='tv_show')


async def _coalesce_ingest(
    key: tuple[str, int],
    leader_work: Callable[[], Awaitable[uuid.UUID]],
) -> uuid.UUID:
    """Run one ingest per TMDb id; concurrent waiters share the result."""
    loop = asyncio.get_running_loop()
    async with _resolve_flights_lock:
        existing = _resolve_flights.get(key)
        if existing is not None:
            waiter: asyncio.Future[uuid.UUID] = existing
            is_leader = False
        else:
            waiter = loop.create_future()
            _resolve_flights[key] = waiter
            is_leader = True

    if not is_leader:
        return await asyncio.shield(waiter)

    try:
        content_id = await leader_work()
    except BaseException as exc:
        if not waiter.done():
            waiter.set_exception(exc)
        raise
    else:
        if not waiter.done():
            waiter.set_result(content_id)
        return content_id
    finally:
        async with _resolve_flights_lock:
            if _resolve_flights.get(key) is waiter:
                del _resolve_flights[key]


async def _ingest_movie(
    session: AsyncSession,
    settings: Settings,
    tmdb_id: int,
    *,
    client_ip: str | None,
) -> uuid.UUID:
    await enforce_resolve_ingest_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=client_ip,
    )

    try:
        client = TmdbClient.from_settings(settings)
    except TmdbConfigError as exc:
        raise CatalogUnavailableError(str(exc)) from exc

    try:
        content_id = await metadata_ingest.ensure_movie_from_tmdb(
            session,
            tmdb_id,
            client=client,
        )
    except TmdbNotFoundError as exc:
        raise CatalogNotFoundError('movie not found on TMDb') from exc
    except TmdbUnavailableError as exc:
        raise CatalogUnavailableError(str(exc)) from exc

    await _warm_movie_detail_cache(session, settings, content_id)
    return content_id


async def _ingest_tv(
    session: AsyncSession,
    settings: Settings,
    tmdb_id: int,
    *,
    client_ip: str | None,
) -> uuid.UUID:
    await enforce_resolve_ingest_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=client_ip,
    )

    try:
        client = TmdbClient.from_settings(settings)
    except TmdbConfigError as exc:
        raise CatalogUnavailableError(str(exc)) from exc

    try:
        content_id = await metadata_ingest.ensure_tv_from_tmdb(
            session,
            tmdb_id,
            client=client,
        )
    except TmdbNotFoundError as exc:
        raise CatalogNotFoundError('tv show not found on TMDb') from exc
    except TmdbUnavailableError as exc:
        raise CatalogUnavailableError(str(exc)) from exc

    await _warm_tv_detail_cache(session, settings, content_id)
    return content_id


async def _warm_movie_detail_cache(
    session: AsyncSession,
    settings: Settings,
    content_id: uuid.UUID,
) -> None:
    """Write-through detail cache so the post-redirect GET is a HIT."""
    try:
        detail = await metadata_service.get_movie_detail(
            session,
            content_id,
            resolve_similar=True,
        )
    except CatalogNotFoundError:
        return
    await get_cache().set(
        movie_detail_key(content_id),
        detail.model_dump_json(),
        ttl_seconds=settings.metadata_cache_ttl_seconds,
    )


async def _warm_tv_detail_cache(
    session: AsyncSession,
    settings: Settings,
    content_id: uuid.UUID,
) -> None:
    """Write-through detail cache so the post-redirect GET is a HIT."""
    try:
        detail = await metadata_service.get_tv_detail(
            session,
            content_id,
            resolve_similar=True,
        )
    except CatalogNotFoundError:
        return
    await get_cache().set(
        tv_detail_key(content_id),
        detail.model_dump_json(),
        ttl_seconds=settings.metadata_cache_ttl_seconds,
    )
