"""Public metadata detail routes under ``/api/v1``."""

from __future__ import annotations

import asyncio
import random
import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, Request, Response, status
from pydantic import ValidationError

from app.core.cache import CacheBackend, get_cache
from app.core.config import Settings
from app.core.deps import DbSessionDep, SettingsDep
from app.core.trusted_client import resolve_client_ip
from app.metadata import resolve as metadata_resolve
from app.metadata import service as metadata_service
from app.metadata.cache_keys import (
    landing_top_posters_key,
    movie_detail_key,
    now_in_theatres_key,
    person_detail_key,
    top_movies_key,
    top_tv_shows_key,
    tv_detail_key,
)
from app.metadata.rate_limit import (
    enforce_landing_posters_rate_limit,
    enforce_resolve_rate_limit,
    enforce_top_movies_rate_limit,
)
from app.metadata.schemas import (
    HomeRailsResponse,
    LandingPoster,
    LandingPostersResponse,
    MovieDetail,
    NowInTheatresResponse,
    PersonDetail,
    ResolveByTmdbRequest,
    ResolveByTmdbResponse,
    SeasonDetail,
    TopMovie,
    TopMoviesResponse,
    TopTvShowsResponse,
    TvDetail,
)

router = APIRouter(tags=['metadata'])

_CACHE_CONTROL = 'public, max-age=300'
_LANDING_CACHE_CONTROL = 'public, max-age=3600'
_LANDING_EMPTY_CACHE_CONTROL = 'public, max-age=60'
_HOME_RAIL_CACHE_CONTROL = 'private, no-store'
_TMDB_POSTER_URL_PREFIX = 'https://image.tmdb.org/t/p/'

# Single-flight fill so concurrent cold misses share one TMDb fetch.
_landing_singleflight = asyncio.Lock()
_top_movies_singleflight = asyncio.Lock()
_top_tv_shows_singleflight = asyncio.Lock()
_now_in_theatres_singleflight = asyncio.Lock()


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


def _filter_rail_titles(titles: list[TopMovie]) -> list[TopMovie]:
    return [title for title in titles if _is_valid_tmdb_poster_url(title.poster_url)]


def _public_rail_display_limit(limit: int | None, settings: Settings) -> int:
    """Clamp requested (or default) rail size to the public max."""
    requested = limit if limit is not None else settings.top_movies_default_limit
    return min(requested, settings.top_movies_max_public_limit)


def _filter_top_movies(detail: TopMoviesResponse) -> TopMoviesResponse:
    filtered = _filter_rail_titles(detail.movies)
    if len(filtered) == len(detail.movies):
        return detail
    return TopMoviesResponse(movies=filtered)


def _filter_top_tv_shows(detail: TopTvShowsResponse) -> TopTvShowsResponse:
    filtered = _filter_rail_titles(detail.shows)
    if len(filtered) == len(detail.shows):
        return detail
    return TopTvShowsResponse(shows=filtered)


def _filter_now_in_theatres(detail: NowInTheatresResponse) -> NowInTheatresResponse:
    filtered = _filter_rail_titles(detail.movies)
    if len(filtered) == len(detail.movies):
        return detail
    return NowInTheatresResponse(movies=filtered)


def _shuffle_titles(titles: list[TopMovie], *, limit: int) -> list[TopMovie]:
    sample = list(titles)
    random.shuffle(sample)
    return sample[:limit]


def _shuffle_top_movies(
    pool: TopMoviesResponse,
    *,
    limit: int,
) -> TopMoviesResponse:
    """Return a shuffled sample of up to ``limit`` movies from the pool."""
    return TopMoviesResponse(movies=_shuffle_titles(pool.movies, limit=limit))


def _shuffle_top_tv_shows(
    pool: TopTvShowsResponse,
    *,
    limit: int,
) -> TopTvShowsResponse:
    return TopTvShowsResponse(shows=_shuffle_titles(pool.shows, limit=limit))


async def _read_cached_top_movies(
    cache: CacheBackend,
    key: str,
) -> TopMoviesResponse | None:
    """Return a validated, URL-filtered cache hit, or ``None`` to fall through."""
    cached = await cache.get(key)
    if cached is None:
        return None
    try:
        detail = TopMoviesResponse.model_validate_json(cached)
    except ValidationError:
        await cache.delete(key)
        return None
    filtered = _filter_top_movies(detail)
    if detail.movies and not filtered.movies:
        await cache.delete(key)
        return None
    return filtered


async def _read_cached_top_tv_shows(
    cache: CacheBackend,
    key: str,
) -> TopTvShowsResponse | None:
    cached = await cache.get(key)
    if cached is None:
        return None
    try:
        detail = TopTvShowsResponse.model_validate_json(cached)
    except ValidationError:
        await cache.delete(key)
        return None
    filtered = _filter_top_tv_shows(detail)
    if detail.shows and not filtered.shows:
        await cache.delete(key)
        return None
    return filtered


async def _read_cached_now_in_theatres(
    cache: CacheBackend,
    key: str,
) -> NowInTheatresResponse | None:
    cached = await cache.get(key)
    if cached is None:
        return None
    try:
        detail = NowInTheatresResponse.model_validate_json(cached)
    except ValidationError:
        await cache.delete(key)
        return None
    filtered = _filter_now_in_theatres(detail)
    if detail.movies and not filtered.movies:
        await cache.delete(key)
        return None
    return filtered


async def _load_top_movies_pool(
    settings: SettingsDep,
    response: Response,
) -> TopMoviesResponse:
    """Load the cached TMDb top-movies pool (fill on miss).

    Request-level rate limiting is enforced in ``get_top_movies`` before this
    runs (HIT / BYPASS / MISS). This loader does not charge a separate bucket.
    """
    cache = get_cache()
    key = top_movies_key(count=settings.top_movies_pool_count)

    hit = await _read_cached_top_movies(cache, key)
    if hit is not None:
        response.headers['X-Cache'] = 'HIT'
        return hit

    async with _top_movies_singleflight:
        hit = await _read_cached_top_movies(cache, key)
        if hit is not None:
            response.headers['X-Cache'] = 'HIT'
            return hit

        if not settings.tmdb_api_key.strip():
            response.headers['X-Cache'] = 'BYPASS'
            return TopMoviesResponse(movies=[])

        try:
            detail = await metadata_service.fetch_top_movies_pool(settings)
        except metadata_service.TopMoviesUnavailableError:
            detail = TopMoviesResponse(movies=[])

        filtered = _filter_top_movies(detail)
        if not filtered.movies:
            existing = await _read_cached_top_movies(cache, key)
            if existing is not None and existing.movies:
                response.headers['X-Cache'] = 'HIT'
                return existing
            await cache.set(
                key,
                TopMoviesResponse(movies=[]).model_dump_json(),
                ttl_seconds=settings.top_movies_negative_cache_ttl_seconds,
            )
            response.headers['X-Cache'] = 'MISS'
            return TopMoviesResponse(movies=[])

        await cache.set(
            key,
            filtered.model_dump_json(),
            ttl_seconds=settings.top_movies_cache_ttl_seconds,
        )
        response.headers['X-Cache'] = 'MISS'
        return filtered


async def _load_top_tv_shows_pool(
    settings: SettingsDep,
    response: Response,
) -> TopTvShowsResponse:
    cache = get_cache()
    key = top_tv_shows_key(count=settings.top_movies_pool_count)

    hit = await _read_cached_top_tv_shows(cache, key)
    if hit is not None:
        response.headers['X-Cache'] = 'HIT'
        return hit

    async with _top_tv_shows_singleflight:
        hit = await _read_cached_top_tv_shows(cache, key)
        if hit is not None:
            response.headers['X-Cache'] = 'HIT'
            return hit

        if not settings.tmdb_api_key.strip():
            response.headers['X-Cache'] = 'BYPASS'
            return TopTvShowsResponse(shows=[])

        try:
            detail = await metadata_service.fetch_top_tv_shows_pool(settings)
        except metadata_service.TopTvShowsUnavailableError:
            detail = TopTvShowsResponse(shows=[])

        filtered = _filter_top_tv_shows(detail)
        if not filtered.shows:
            existing = await _read_cached_top_tv_shows(cache, key)
            if existing is not None and existing.shows:
                response.headers['X-Cache'] = 'HIT'
                return existing
            await cache.set(
                key,
                TopTvShowsResponse(shows=[]).model_dump_json(),
                ttl_seconds=settings.top_movies_negative_cache_ttl_seconds,
            )
            response.headers['X-Cache'] = 'MISS'
            return TopTvShowsResponse(shows=[])

        await cache.set(
            key,
            filtered.model_dump_json(),
            ttl_seconds=settings.top_movies_cache_ttl_seconds,
        )
        response.headers['X-Cache'] = 'MISS'
        return filtered


async def _load_now_in_theatres_pool(
    settings: SettingsDep,
    response: Response,
) -> NowInTheatresResponse:
    cache = get_cache()
    key = now_in_theatres_key(count=settings.top_movies_pool_count)

    hit = await _read_cached_now_in_theatres(cache, key)
    if hit is not None:
        response.headers['X-Cache'] = 'HIT'
        return hit

    async with _now_in_theatres_singleflight:
        hit = await _read_cached_now_in_theatres(cache, key)
        if hit is not None:
            response.headers['X-Cache'] = 'HIT'
            return hit

        if not settings.tmdb_api_key.strip():
            response.headers['X-Cache'] = 'BYPASS'
            return NowInTheatresResponse(movies=[])

        try:
            detail = await metadata_service.fetch_now_in_theatres_pool(settings)
        except metadata_service.NowInTheatresUnavailableError:
            detail = NowInTheatresResponse(movies=[])

        filtered = _filter_now_in_theatres(detail)
        if not filtered.movies:
            existing = await _read_cached_now_in_theatres(cache, key)
            if existing is not None and existing.movies:
                response.headers['X-Cache'] = 'HIT'
                return existing
            await cache.set(
                key,
                NowInTheatresResponse(movies=[]).model_dump_json(),
                ttl_seconds=settings.top_movies_negative_cache_ttl_seconds,
            )
            response.headers['X-Cache'] = 'MISS'
            return NowInTheatresResponse(movies=[])

        await cache.set(
            key,
            filtered.model_dump_json(),
            ttl_seconds=settings.now_in_theatres_cache_ttl_seconds,
        )
        response.headers['X-Cache'] = 'MISS'
        return filtered


@router.get('/catalog/top-movies', response_model=TopMoviesResponse)
async def get_top_movies(
    request: Request,
    settings: SettingsDep,
    response: Response,
    limit: int | None = Query(default=None, ge=1, le=100),
) -> TopMoviesResponse:
    """Return a shuffled sample from TMDb's all-time top-rated movies.

    Public (unauthenticated), like ``/landing/posters``. Served to signed-in
    ``/`` and guest ``/`` (public home) via RSC (not the browser BFF proxy). Every
    request is subject to a per-IP rate limit (HIT / BYPASS / MISS). The full
    pool (default 100) is Redis-cached; each response reshuffles and truncates
    to ``limit``. Degrades to an empty list when TMDb is unavailable so the
    home rail can show an empty state.
    """
    client_ip = resolve_client_ip(request, settings)
    await enforce_top_movies_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=client_ip,
    )
    display_limit = _public_rail_display_limit(limit, settings)
    pool = await _load_top_movies_pool(settings, response)
    response.headers['Cache-Control'] = _HOME_RAIL_CACHE_CONTROL
    return _shuffle_top_movies(pool, limit=display_limit)


@router.get('/catalog/top-tv-shows', response_model=TopTvShowsResponse)
async def get_top_tv_shows(
    request: Request,
    settings: SettingsDep,
    response: Response,
    limit: int | None = Query(default=None, ge=1, le=100),
) -> TopTvShowsResponse:
    """Return a shuffled sample from TMDb's all-time top-rated TV shows."""
    client_ip = resolve_client_ip(request, settings)
    await enforce_top_movies_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=client_ip,
    )
    display_limit = _public_rail_display_limit(limit, settings)
    pool = await _load_top_tv_shows_pool(settings, response)
    response.headers['Cache-Control'] = _HOME_RAIL_CACHE_CONTROL
    return _shuffle_top_tv_shows(pool, limit=display_limit)


@router.get('/catalog/now-in-theatres', response_model=NowInTheatresResponse)
async def get_now_in_theatres(
    request: Request,
    settings: SettingsDep,
    response: Response,
    limit: int | None = Query(default=None, ge=1, le=100),
) -> NowInTheatresResponse:
    """Return the most popular movies currently in theatres (TMDb now_playing)."""
    client_ip = resolve_client_ip(request, settings)
    await enforce_top_movies_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=client_ip,
    )
    display_limit = _public_rail_display_limit(limit, settings)
    pool = await _load_now_in_theatres_pool(settings, response)
    response.headers['Cache-Control'] = _HOME_RAIL_CACHE_CONTROL
    return NowInTheatresResponse(movies=pool.movies[:display_limit])


@router.get('/catalog/home-rails', response_model=HomeRailsResponse)
async def get_home_rails(
    request: Request,
    settings: SettingsDep,
    response: Response,
    limit: int | None = Query(default=None, ge=1, le=100),
) -> HomeRailsResponse:
    """Return shuffled home rails in one response (RSC → API only).

    Charges the same per-IP rate limit once (not three times). Each rail is
    still drawn from its Redis-backed pool.
    """
    client_ip = resolve_client_ip(request, settings)
    await enforce_top_movies_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=client_ip,
    )
    display_limit = _public_rail_display_limit(limit, settings)
    theatres_pool, movies_pool, tv_pool = await asyncio.gather(
        _load_now_in_theatres_pool(settings, response),
        _load_top_movies_pool(settings, response),
        _load_top_tv_shows_pool(settings, response),
    )
    response.headers['Cache-Control'] = _HOME_RAIL_CACHE_CONTROL
    # Prefer MISS if any pool fill was a miss (headers overwritten by last load).
    return HomeRailsResponse(
        in_theatres=theatres_pool.movies[:display_limit],
        movies=_shuffle_top_movies(movies_pool, limit=display_limit).movies,
        shows=_shuffle_top_tv_shows(tv_pool, limit=display_limit).shows,
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


@router.get(
    '/tv/{content_id}/seasons/{season_number}',
    response_model=SeasonDetail,
)
async def get_tv_season(
    request: Request,
    content_id: uuid.UUID,
    season_number: Annotated[int, Path(ge=0, le=200)],
    session: DbSessionDep,
    settings: SettingsDep,
    response: Response,
) -> SeasonDetail:
    """Return one TV season with full episodes (lazy tab load).

    Cold stub seasons may trigger an on-demand TMDb season hydrate
    (ingest-equivalent per-IP rate limit + process single-flight).
    """
    client_ip = resolve_client_ip(request, settings)
    await enforce_resolve_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=client_ip,
    )
    response.headers['Cache-Control'] = _CACHE_CONTROL
    try:
        return await metadata_service.get_tv_season_detail(
            session,
            content_id,
            season_number,
            settings=settings,
            client_ip=client_ip,
        )
    except metadata_service.CatalogNotFoundError as exc:
        raise _not_found('TV season not found') from exc
    except metadata_service.CatalogUnavailableError as exc:
        raise _unavailable('Catalog temporarily unavailable') from exc


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
