"""Auth-aware catalog HTTP routes (API layer may import Auth + Metadata)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.auth.deps import OptionalIdentityDep
from app.core.cache import get_cache
from app.core.deps import DbSessionDep, SettingsDep
from app.core.trusted_client import resolve_client_ip
from app.library import service as library_service
from app.library.schemas import (
    RatingFilter,
    RatingSort,
    ReviewResponse,
    ReviewSort,
    ReviewsPageResponse,
    SpoilerFilter,
    TitleRatingsPageResponse,
)
from app.lists import service as lists_service
from app.lists.schemas import TitlePublicListsPageResponse
from app.metadata import api as metadata_api
from app.metadata.rate_limit import enforce_top_movies_rate_limit
from app.metadata.schemas import TopMoviesResponse, TopTvShowsResponse
from app.users.rate_limit import enforce_users_public_rate_limit

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


async def _list_title_reviews(
    request: Request,
    *,
    content_type: str,
    content_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    identity: OptionalIdentityDep,
    response: Response,
    page: int,
    limit: int,
    sort: ReviewSort,
    spoiler_filter: SpoilerFilter | None,
    rating_filter: RatingFilter,
    include_note_ids: list[uuid.UUID] | None,
) -> ReviewsPageResponse:
    await enforce_users_public_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=resolve_client_ip(request, settings),
    )
    response.headers['Cache-Control'] = 'private, no-store'
    try:
        return await library_service.list_title_reviews(
            session,
            content_type=content_type,
            content_id=content_id,
            identity_id=identity.id if identity is not None else None,
            page=page,
            limit=limit,
            sort=sort,
            spoiler_filter=spoiler_filter,
            rating_filter=rating_filter,
            include_note_ids=include_note_ids,
        )
    except library_service.ContentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Content not found',
        ) from exc
    except library_service.UnsupportedWatchContentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc) or 'Unsupported content type',
        ) from exc


async def _get_title_review(
    request: Request,
    *,
    content_type: str,
    content_id: uuid.UUID,
    entry_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    identity: OptionalIdentityDep,
    response: Response,
) -> ReviewResponse:
    await enforce_users_public_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=resolve_client_ip(request, settings),
    )
    response.headers['Cache-Control'] = 'private, no-store'
    try:
        return await library_service.get_title_review(
            session,
            content_type=content_type,
            content_id=content_id,
            entry_id=entry_id,
            identity_id=identity.id if identity is not None else None,
        )
    except library_service.ContentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Content not found',
        ) from exc
    except library_service.WatchEntryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Review not found',
        ) from exc
    except library_service.UnsupportedWatchContentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc) or 'Unsupported content type',
        ) from exc


async def _list_title_ratings(
    request: Request,
    *,
    content_type: str,
    content_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    response: Response,
    page: int,
    limit: int,
    sort: RatingSort,
) -> TitleRatingsPageResponse:
    await enforce_users_public_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=resolve_client_ip(request, settings),
    )
    response.headers['Cache-Control'] = 'private, no-store'
    try:
        return await library_service.list_title_ratings(
            session,
            content_type=content_type,
            content_id=content_id,
            page=page,
            limit=limit,
            sort=sort,
        )
    except library_service.ContentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Content not found',
        ) from exc
    except library_service.UnsupportedWatchContentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc) or 'Unsupported content type',
        ) from exc


async def _list_title_public_lists(
    request: Request,
    *,
    content_type: str,
    content_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    response: Response,
    page: int,
    limit: int,
) -> TitlePublicListsPageResponse:
    await enforce_users_public_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=resolve_client_ip(request, settings),
    )
    response.headers['Cache-Control'] = 'private, no-store'
    try:
        return await lists_service.list_public_lists_for_title(
            session,
            content_type=content_type,
            content_id=content_id,
            page=page,
            limit=limit,
        )
    except lists_service.ContentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Content not found',
        ) from exc
    except lists_service.UnsupportedListContentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc) or 'Unsupported content type',
        ) from exc


@router.get(
    '/movies/{content_id}/reviews',
    response_model=ReviewsPageResponse,
)
async def list_movie_reviews(
    request: Request,
    content_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    identity: OptionalIdentityDep,
    response: Response,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
    sort: Annotated[ReviewSort, Query()] = 'popular',
    spoiler_filter: Annotated[SpoilerFilter | None, Query()] = None,
    rating_filter: Annotated[RatingFilter, Query()] = 'any',
    include_note_ids: Annotated[list[uuid.UUID] | None, Query()] = None,
) -> ReviewsPageResponse:
    """Public paginated reviews for a movie (qualifying watch logs)."""
    return await _list_title_reviews(
        request,
        content_type='movie',
        content_id=content_id,
        session=session,
        settings=settings,
        identity=identity,
        response=response,
        page=page,
        limit=limit,
        sort=sort,
        spoiler_filter=spoiler_filter,
        rating_filter=rating_filter,
        include_note_ids=include_note_ids,
    )


@router.get(
    '/tv/{content_id}/reviews',
    response_model=ReviewsPageResponse,
)
async def list_tv_reviews(
    request: Request,
    content_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    identity: OptionalIdentityDep,
    response: Response,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
    sort: Annotated[ReviewSort, Query()] = 'popular',
    spoiler_filter: Annotated[SpoilerFilter | None, Query()] = None,
    rating_filter: Annotated[RatingFilter, Query()] = 'any',
    include_note_ids: Annotated[list[uuid.UUID] | None, Query()] = None,
) -> ReviewsPageResponse:
    """Public paginated reviews for a TV title (qualifying watch logs)."""
    return await _list_title_reviews(
        request,
        content_type='tv',
        content_id=content_id,
        session=session,
        settings=settings,
        identity=identity,
        response=response,
        page=page,
        limit=limit,
        sort=sort,
        spoiler_filter=spoiler_filter,
        rating_filter=rating_filter,
        include_note_ids=include_note_ids,
    )


@router.get(
    '/movies/{content_id}/reviews/{entry_id}',
    response_model=ReviewResponse,
)
async def get_movie_review(
    request: Request,
    content_id: uuid.UUID,
    entry_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    identity: OptionalIdentityDep,
    response: Response,
) -> ReviewResponse:
    """Public reveal of one movie review, including spoiler text."""
    return await _get_title_review(
        request,
        content_type='movie',
        content_id=content_id,
        entry_id=entry_id,
        session=session,
        settings=settings,
        identity=identity,
        response=response,
    )


@router.get(
    '/tv/{content_id}/reviews/{entry_id}',
    response_model=ReviewResponse,
)
async def get_tv_review(
    request: Request,
    content_id: uuid.UUID,
    entry_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    identity: OptionalIdentityDep,
    response: Response,
) -> ReviewResponse:
    """Public reveal of one TV review, including spoiler text."""
    return await _get_title_review(
        request,
        content_type='tv',
        content_id=content_id,
        entry_id=entry_id,
        session=session,
        settings=settings,
        identity=identity,
        response=response,
    )


@router.get(
    '/movies/{content_id}/ratings',
    response_model=TitleRatingsPageResponse,
)
async def list_movie_ratings(
    request: Request,
    content_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    response: Response,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
    sort: Annotated[RatingSort, Query()] = 'highest',
) -> TitleRatingsPageResponse:
    """Latest diary rating per live user for a movie."""
    return await _list_title_ratings(
        request,
        content_type='movie',
        content_id=content_id,
        session=session,
        settings=settings,
        response=response,
        page=page,
        limit=limit,
        sort=sort,
    )


@router.get(
    '/tv/{content_id}/ratings',
    response_model=TitleRatingsPageResponse,
)
async def list_tv_ratings(
    request: Request,
    content_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    response: Response,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
    sort: Annotated[RatingSort, Query()] = 'highest',
) -> TitleRatingsPageResponse:
    """Latest diary rating per live user for a TV title."""
    return await _list_title_ratings(
        request,
        content_type='tv',
        content_id=content_id,
        session=session,
        settings=settings,
        response=response,
        page=page,
        limit=limit,
        sort=sort,
    )


@router.get(
    '/movies/{content_id}/lists',
    response_model=TitlePublicListsPageResponse,
)
async def list_movie_public_lists(
    request: Request,
    content_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    response: Response,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
) -> TitlePublicListsPageResponse:
    """Public custom lists that contain this movie."""
    return await _list_title_public_lists(
        request,
        content_type='movie',
        content_id=content_id,
        session=session,
        settings=settings,
        response=response,
        page=page,
        limit=limit,
    )


@router.get(
    '/tv/{content_id}/lists',
    response_model=TitlePublicListsPageResponse,
)
async def list_tv_public_lists(
    request: Request,
    content_id: uuid.UUID,
    session: DbSessionDep,
    settings: SettingsDep,
    response: Response,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
) -> TitlePublicListsPageResponse:
    """Public custom lists that contain this TV title."""
    return await _list_title_public_lists(
        request,
        content_type='tv',
        content_id=content_id,
        session=session,
        settings=settings,
        response=response,
        page=page,
        limit=limit,
    )
