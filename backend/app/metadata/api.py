"""Public metadata detail routes under ``/api/v1``."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.core.cache import get_cache
from app.core.deps import DbSessionDep, SettingsDep
from app.core.trusted_client import resolve_client_ip
from app.metadata import resolve as metadata_resolve
from app.metadata import service as metadata_service
from app.metadata.cache_keys import (
    movie_detail_key,
    person_detail_key,
    tv_detail_key,
)
from app.metadata.rate_limit import enforce_resolve_rate_limit
from app.metadata.schemas import (
    MovieDetail,
    PersonDetail,
    ResolveByTmdbRequest,
    ResolveByTmdbResponse,
    TvDetail,
)

router = APIRouter(tags=['metadata'])

_CACHE_CONTROL = 'public, max-age=300'


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _unavailable(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=detail,
    )


@router.post('/movies/resolve', response_model=ResolveByTmdbResponse)
async def resolve_movie(
    request: Request,
    body: ResolveByTmdbRequest,
    session: DbSessionDep,
    settings: SettingsDep,
) -> ResolveByTmdbResponse:
    """Resolve a TMDb movie id to a canonical catalog id (ingest if needed)."""
    client_ip = resolve_client_ip(request, settings)
    await enforce_resolve_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=client_ip,
    )
    try:
        return await metadata_resolve.resolve_movie_by_tmdb(
            session,
            settings,
            body.tmdb_id,
            client_ip=client_ip,
        )
    except metadata_service.CatalogNotFoundError as exc:
        raise _not_found('Movie not found') from exc
    except metadata_resolve.CatalogUnavailableError as exc:
        raise _unavailable(str(exc)) from exc


@router.post('/tv/resolve', response_model=ResolveByTmdbResponse)
async def resolve_tv(
    request: Request,
    body: ResolveByTmdbRequest,
    session: DbSessionDep,
    settings: SettingsDep,
) -> ResolveByTmdbResponse:
    """Resolve a TMDb TV id to a canonical catalog id (ingest if needed)."""
    client_ip = resolve_client_ip(request, settings)
    await enforce_resolve_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=client_ip,
    )
    try:
        return await metadata_resolve.resolve_tv_by_tmdb(
            session,
            settings,
            body.tmdb_id,
            client_ip=client_ip,
        )
    except metadata_service.CatalogNotFoundError as exc:
        raise _not_found('TV show not found') from exc
    except metadata_resolve.CatalogUnavailableError as exc:
        raise _unavailable(str(exc)) from exc


@router.get('/movies/{content_id}', response_model=MovieDetail)
async def get_movie(
    content_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    response: Response,
) -> MovieDetail:
    """Return curated movie detail for a canonical content id."""
    response.headers['Cache-Control'] = _CACHE_CONTROL
    cache = get_cache()
    key = movie_detail_key(content_id)
    cached = await cache.get(key)
    if cached is not None:
        response.headers['X-Cache'] = 'HIT'
        return MovieDetail.model_validate_json(cached)
    try:
        detail = await metadata_service.get_movie_detail(session, content_id)
    except metadata_service.CatalogNotFoundError as exc:
        raise _not_found('Movie not found') from exc
    await cache.set(
        key,
        detail.model_dump_json(),
        ttl_seconds=settings.metadata_cache_ttl_seconds,
    )
    response.headers['X-Cache'] = 'MISS'
    return detail


@router.get('/tv/{content_id}', response_model=TvDetail)
async def get_tv(
    content_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    response: Response,
) -> TvDetail:
    """Return curated TV-show detail for a canonical content id."""
    response.headers['Cache-Control'] = _CACHE_CONTROL
    cache = get_cache()
    key = tv_detail_key(content_id)
    cached = await cache.get(key)
    if cached is not None:
        response.headers['X-Cache'] = 'HIT'
        return TvDetail.model_validate_json(cached)
    try:
        detail = await metadata_service.get_tv_detail(session, content_id)
    except metadata_service.CatalogNotFoundError as exc:
        raise _not_found('TV show not found') from exc
    await cache.set(
        key,
        detail.model_dump_json(),
        ttl_seconds=settings.metadata_cache_ttl_seconds,
    )
    response.headers['X-Cache'] = 'MISS'
    return detail


@router.get('/people/{person_id}', response_model=PersonDetail)
async def get_person(
    person_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    response: Response,
) -> PersonDetail:
    """Return curated person detail for a canonical person id."""
    response.headers['Cache-Control'] = _CACHE_CONTROL
    cache = get_cache()
    key = person_detail_key(person_id)
    cached = await cache.get(key)
    if cached is not None:
        response.headers['X-Cache'] = 'HIT'
        return PersonDetail.model_validate_json(cached)
    try:
        detail = await metadata_service.get_person_detail(session, person_id)
    except metadata_service.CatalogNotFoundError as exc:
        raise _not_found('Person not found') from exc
    await cache.set(
        key,
        detail.model_dump_json(),
        ttl_seconds=settings.metadata_cache_ttl_seconds,
    )
    response.headers['X-Cache'] = 'MISS'
    return detail
