"""Personal library HTTP routes: watchlist + favorites under ``/api/v1/me``."""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.auth.deps import CurrentIdentityDep
from app.core.cache import get_cache
from app.core.deps import DbSessionDep, SettingsDep
from app.core.trusted_client import resolve_client_ip
from app.lists import service as lists_service
from app.lists.rate_limit import enforce_lists_write_rate_limit
from app.lists.schemas import (
    ContainsResponse,
    ContentRefBody,
    ListItemResponse,
    SystemListResponse,
)

router = APIRouter(tags=['lists'])

SystemKind = Literal['watchlist', 'favorites']


def _map_domain_error(exc: Exception) -> HTTPException | None:
    if isinstance(exc, lists_service.ProfileRequiredError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Profile not found',
        )
    if isinstance(exc, lists_service.ContentNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Content not found',
        )
    if isinstance(exc, lists_service.UnsupportedListContentError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='Unsupported content type for lists',
        )
    if isinstance(exc, lists_service.ListCapacityError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='List item limit reached',
        )
    return None


_MAX_CONTAINS_IDS = 50


def _parse_contains_ids(raw: list[str]) -> list[tuple[str, uuid.UUID]]:
    """Parse ``type:uuid`` tokens from the contains query."""
    if len(raw) > _MAX_CONTAINS_IDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f'At most {_MAX_CONTAINS_IDS} ids are allowed',
        )
    refs: list[tuple[str, uuid.UUID]] = []
    for token in raw:
        cleaned = token.strip()
        if not cleaned or ':' not in cleaned:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail='ids must be type:uuid pairs (e.g. movie:<uuid>)',
            )
        type_part, id_part = cleaned.split(':', 1)
        try:
            content_id = uuid.UUID(id_part)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail='ids must be type:uuid pairs (e.g. movie:<uuid>)',
            ) from exc
        refs.append((type_part, content_id))
    return refs


async def _get_system_list(
    *,
    kind: SystemKind,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    page: int,
    limit: int,
) -> SystemListResponse:
    try:
        return await lists_service.get_system_list_page(
            session,
            identity_id=identity.id,
            kind=kind,
            page=page,
            limit=limit,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise


async def _add_item(
    *,
    kind: SystemKind,
    body: ContentRefBody,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> ListItemResponse:
    cache = get_cache()
    await enforce_lists_write_rate_limit(
        cache,
        settings=settings,
        identity_id=identity.id,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        return await lists_service.add_system_list_item(
            session,
            cache=cache,
            identity_id=identity.id,
            kind=kind,
            content_type=body.type,
            content_id=body.id,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise


async def _remove_item(
    *,
    kind: SystemKind,
    body: ContentRefBody,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> Response:
    cache = get_cache()
    await enforce_lists_write_rate_limit(
        cache,
        settings=settings,
        identity_id=identity.id,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        await lists_service.remove_system_list_item(
            session,
            cache=cache,
            identity_id=identity.id,
            kind=kind,
            content_type=body.type,
            content_id=body.id,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _contains(
    *,
    kind: SystemKind,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    ids: list[str],
) -> ContainsResponse:
    refs = _parse_contains_ids(ids)
    try:
        membership = await lists_service.system_list_contains(
            session,
            identity_id=identity.id,
            kind=kind,
            refs=refs,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise
    return ContainsResponse(membership=membership)


@router.get('/me/watchlist', response_model=SystemListResponse)
async def get_watchlist(
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
) -> SystemListResponse:
    """Return the authenticated user's watchlist (lazy-created)."""
    return await _get_system_list(
        kind='watchlist',
        identity=identity,
        session=session,
        page=page,
        limit=limit,
    )


@router.post(
    '/me/watchlist/items',
    response_model=ListItemResponse,
    status_code=status.HTTP_200_OK,
)
async def add_watchlist_item(
    body: ContentRefBody,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> ListItemResponse:
    """Add a title to the watchlist (idempotent)."""
    return await _add_item(
        kind='watchlist',
        body=body,
        identity=identity,
        session=session,
        settings=settings,
        request=request,
    )


@router.delete('/me/watchlist/items', status_code=status.HTTP_204_NO_CONTENT)
async def remove_watchlist_item(
    body: ContentRefBody,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> Response:
    """Remove a title from the watchlist (idempotent)."""
    return await _remove_item(
        kind='watchlist',
        body=body,
        identity=identity,
        session=session,
        settings=settings,
        request=request,
    )


@router.get('/me/watchlist/contains', response_model=ContainsResponse)
async def watchlist_contains(
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    ids: Annotated[
        list[str],
        Query(description='Repeated type:uuid tokens, e.g. movie:<uuid>'),
    ],
) -> ContainsResponse:
    """Batch membership check for watchlist UI toggles."""
    return await _contains(
        kind='watchlist',
        identity=identity,
        session=session,
        ids=ids,
    )


@router.get('/me/favorites', response_model=SystemListResponse)
async def get_favorites(
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
) -> SystemListResponse:
    """Return the authenticated user's favorites (lazy-created)."""
    return await _get_system_list(
        kind='favorites',
        identity=identity,
        session=session,
        page=page,
        limit=limit,
    )


@router.post(
    '/me/favorites/items',
    response_model=ListItemResponse,
    status_code=status.HTTP_200_OK,
)
async def add_favorites_item(
    body: ContentRefBody,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> ListItemResponse:
    """Add a title to favorites (idempotent)."""
    return await _add_item(
        kind='favorites',
        body=body,
        identity=identity,
        session=session,
        settings=settings,
        request=request,
    )


@router.delete('/me/favorites/items', status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorites_item(
    body: ContentRefBody,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> Response:
    """Remove a title from favorites (idempotent)."""
    return await _remove_item(
        kind='favorites',
        body=body,
        identity=identity,
        session=session,
        settings=settings,
        request=request,
    )


@router.get('/me/favorites/contains', response_model=ContainsResponse)
async def favorites_contains(
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    ids: Annotated[
        list[str],
        Query(description='Repeated type:uuid tokens, e.g. movie:<uuid>'),
    ],
) -> ContainsResponse:
    """Batch membership check for favorites UI toggles."""
    return await _contains(
        kind='favorites',
        identity=identity,
        session=session,
        ids=ids,
    )
