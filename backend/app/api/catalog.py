"""Auth-aware catalog HTTP routes (API layer may import Auth + Metadata)."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response

from app.auth.deps import OptionalIdentityDep
from app.core.cache import get_cache
from app.core.deps import SettingsDep
from app.core.trusted_client import resolve_client_ip
from app.metadata import api as metadata_api
from app.metadata.rate_limit import enforce_top_movies_rate_limit
from app.metadata.schemas import TopMoviesResponse, TopTvShowsResponse

router = APIRouter(tags=['metadata'])


@router.get('/catalog/top-movies', response_model=TopMoviesResponse)
async def get_top_movies(
    request: Request,
    settings: SettingsDep,
    response: Response,
    identity: OptionalIdentityDep,
    limit: int | None = Query(default=None, ge=1, le=500),
) -> TopMoviesResponse:
    """Return a shuffled sample from TMDb's all-time top-rated movies.

    Public (unauthenticated) up to ``top_movies_max_public_limit``; with a valid
    Bearer access token up to ``top_movies_max_auth_limit`` (browse shelves).
    Served via RSC (not the browser BFF proxy). Every request is subject to a
    per-IP rate limit (HIT / BYPASS / MISS). The full pool is Redis-cached; each
    response reshuffles and truncates to ``limit``. Degrades to an empty list
    when TMDb is unavailable so the home rail can show an empty state.
    """
    client_ip = resolve_client_ip(request, settings)
    await enforce_top_movies_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=client_ip,
    )
    display_limit = metadata_api._rail_display_limit(
        limit,
        settings,
        authenticated=identity is not None,
    )
    pool = await metadata_api._load_top_movies_pool(settings, response)
    response.headers['Cache-Control'] = metadata_api._HOME_RAIL_CACHE_CONTROL
    return metadata_api._shuffle_top_movies(pool, limit=display_limit)


@router.get('/catalog/top-tv-shows', response_model=TopTvShowsResponse)
async def get_top_tv_shows(
    request: Request,
    settings: SettingsDep,
    response: Response,
    identity: OptionalIdentityDep,
    limit: int | None = Query(default=None, ge=1, le=500),
) -> TopTvShowsResponse:
    """Return a shuffled sample from TMDb's all-time top-rated TV shows."""
    client_ip = resolve_client_ip(request, settings)
    await enforce_top_movies_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=client_ip,
    )
    display_limit = metadata_api._rail_display_limit(
        limit,
        settings,
        authenticated=identity is not None,
    )
    pool = await metadata_api._load_top_tv_shows_pool(settings, response)
    response.headers['Cache-Control'] = metadata_api._HOME_RAIL_CACHE_CONTROL
    return metadata_api._shuffle_top_tv_shows(pool, limit=display_limit)
