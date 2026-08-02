"""Public metadata detail routes under ``/api/v1``."""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import ValidationError

from app.core.cache import CacheBackend, get_cache
from app.core.deps import DbSessionDep, SettingsDep
from app.core.trusted_client import resolve_client_ip
from app.metadata import resolve as metadata_resolve
from app.metadata import service as metadata_service
from app.metadata.cache_keys import (
    landing_top_posters_key,
    movie_detail_key,
    person_detail_key,
    tv_detail_key,
)
from app.metadata.rate_limit import (
    enforce_landing_posters_rate_limit,
    enforce_resolve_rate_limit,
)
from app.metadata.schemas import (
    LandingPoster,
    LandingPostersResponse,
    MovieDetail,
    PersonDetail,
    ResolveByTmdbRequest,
    ResolveByTmdbResponse,
    TvDetail,
)

router = APIRouter(tags=['metadata'])

_CACHE_CONTROL = 'public, max-age=300'
_LANDING_CACHE_CONTROL = 'public, max-age=3600'
_LANDING_EMPTY_CACHE_CONTROL = 'public, max-age=60'
_TMDB_POSTER_URL_PREFIX = 'https://image.tmdb.org/t/p/'

# Single-flight fill so concurrent cold misses share one TMDb fetch.
_landing_singleflight = asyncio.Lock()


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _unavailable(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=detail,
    )


def _is_valid_tmdb_poster_url(url: str) -> bool:
    return url.startswith(_TMDB_POSTER_URL_PREFIX)


def _filter_landing_posters(
    detail: LandingPostersResponse,
) -> LandingPostersResponse:
    filtered = [
        poster
        for poster in detail.posters
        if _is_valid_tmdb_poster_url(poster.poster_url)
    ]
    if len(filtered) == len(detail.posters):
        return detail
    return LandingPostersResponse(posters=filtered)


def _apply_landing_cache_control(
    response: Response,
    posters: list[LandingPoster],
) -> None:
    response.headers['Cache-Control'] = (
        _LANDING_CACHE_CONTROL if posters else _LANDING_EMPTY_CACHE_CONTROL
    )


async def _read_cached_landing(
    cache: CacheBackend,
    key: str,
) -> LandingPostersResponse | None:
    """Return a validated, URL-filtered cache hit, or ``None`` to fall through.

    Deletes the key when JSON is corrupt or every poster URL fails the
    allowlist. An intentionally empty (negative-cache) payload is kept.
    """
    cached = await cache.get(key)
    if cached is None:
        return None
    try:
        detail = LandingPostersResponse.model_validate_json(cached)
    except ValidationError:
        await cache.delete(key)
        return None
    filtered = _filter_landing_posters(detail)
    if detail.posters and not filtered.posters:
        await cache.delete(key)
        return None
    return filtered


@router.get('/landing/posters', response_model=LandingPostersResponse)
async def get_landing_posters(
    request: Request,
    settings: SettingsDep,
    response: Response,
) -> LandingPostersResponse:
    """Return a shared TMDb top-rated poster set for landing / auth shells.

    Cached via CacheBackend (Redis when available). Degrades to an empty list
    when TMDb is unavailable so the UI can fall back to the amber atmosphere.
    """
    client_ip = resolve_client_ip(request, settings)
    cache = get_cache()
    await enforce_landing_posters_rate_limit(
        cache,
        settings=settings,
        client_ip=client_ip,
    )

    key = landing_top_posters_key(count=settings.landing_posters_count)

    hit = await _read_cached_landing(cache, key)
    if hit is not None:
        response.headers['X-Cache'] = 'HIT'
        _apply_landing_cache_control(response, hit.posters)
        return hit

    async with _landing_singleflight:
        hit = await _read_cached_landing(cache, key)
        if hit is not None:
            response.headers['X-Cache'] = 'HIT'
            _apply_landing_cache_control(response, hit.posters)
            return hit

        if not settings.tmdb_api_key.strip():
            response.headers['X-Cache'] = 'BYPASS'
            _apply_landing_cache_control(response, [])
            return LandingPostersResponse(posters=[])

        try:
            detail = await metadata_service.fetch_landing_top_posters(settings)
        except metadata_service.LandingPostersUnavailableError:
            detail = LandingPostersResponse(posters=[])

        filtered = _filter_landing_posters(detail)
        if not filtered.posters:
            existing = await _read_cached_landing(cache, key)
            if existing is not None and existing.posters:
                response.headers['X-Cache'] = 'HIT'
                _apply_landing_cache_control(response, existing.posters)
                return existing
            await cache.set(
                key,
                LandingPostersResponse(posters=[]).model_dump_json(),
                ttl_seconds=settings.landing_posters_negative_cache_ttl_seconds,
            )
            response.headers['X-Cache'] = 'MISS'
            _apply_landing_cache_control(response, [])
            return LandingPostersResponse(posters=[])

        await cache.set(
            key,
            filtered.model_dump_json(),
            ttl_seconds=settings.landing_posters_cache_ttl_seconds,
        )
        response.headers['X-Cache'] = 'MISS'
        _apply_landing_cache_control(response, filtered.posters)
        return filtered


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
