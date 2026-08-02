"""On-click TMDb resolve / ingest (kept out of read-only service)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.core.config import Settings
from app.metadata import ingest as metadata_ingest
from app.metadata import repository as metadata_repository
from app.metadata.rate_limit import enforce_resolve_ingest_rate_limit
from app.metadata.schemas import ResolveByTmdbResponse
from app.metadata.service import CatalogNotFoundError
from app.metadata.tmdb.client import (
    TmdbClient,
    TmdbConfigError,
    TmdbNotFoundError,
    TmdbUnavailableError,
)


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
    return ResolveByTmdbResponse(id=content_id, type='tv_show')
