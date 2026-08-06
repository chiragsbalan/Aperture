"""Personal library HTTP routes: system lists + custom lists."""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.auth.deps import CurrentIdentityDep, OptionalIdentityDep
from app.core.cache import get_cache
from app.core.deps import DbSessionDep, SettingsDep
from app.core.trusted_client import resolve_client_ip
from app.library import service as library_service
from app.library.rate_limit import enforce_watch_entries_contains_rate_limit
from app.lists import service as lists_service
from app.lists.rate_limit import enforce_lists_write_rate_limit
from app.lists.schemas import (
    ContainsResponse,
    ContentRefBody,
    CreateCustomListBody,
    CustomListDetailResponse,
    CustomListItemsResponse,
    CustomListMembershipResponse,
    CustomListPageResponse,
    ListItemResponse,
    PatchCustomListBody,
    SystemListResponse,
    TitleLibraryStatusResponse,
)
from app.users.rate_limit import enforce_users_public_rate_limit

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
    if isinstance(exc, lists_service.ListNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='List not found',
        )
    if isinstance(exc, lists_service.UnsupportedListContentError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc) or 'Unsupported content type for lists',
        )
    if isinstance(exc, lists_service.ListCapacityError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='List item limit reached',
        )
    if isinstance(exc, lists_service.CustomListCapacityError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Custom list limit reached',
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


@router.get('/me/lists', response_model=CustomListPageResponse)
async def list_my_custom_lists(
    identity: CurrentIdentityDep,
    session: DbSessionDep,
) -> CustomListPageResponse:
    """Return the authenticated user's custom lists."""
    try:
        lists = await lists_service.list_my_custom_lists(
            session,
            identity_id=identity.id,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise
    return CustomListPageResponse(lists=lists)


@router.post(
    '/me/lists',
    response_model=CustomListDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_custom_list(
    body: CreateCustomListBody,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> CustomListDetailResponse:
    """Create a custom list."""
    cache = get_cache()
    await enforce_lists_write_rate_limit(
        cache,
        settings=settings,
        identity_id=identity.id,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        return await lists_service.create_custom_list(
            session,
            identity_id=identity.id,
            title=body.title,
            description=body.description,
            visibility=body.visibility,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise


@router.get(
    '/me/lists/membership',
    response_model=CustomListMembershipResponse,
)
async def custom_lists_membership(
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    type: Annotated[str, Query(min_length=1, max_length=16)],
    id: Annotated[uuid.UUID, Query()],
) -> CustomListMembershipResponse:
    """Membership of one content ref across all of the owner's custom lists."""
    try:
        membership, item_ids = await lists_service.custom_lists_membership_for_content(
            session,
            identity_id=identity.id,
            content_type=type,
            content_id=id,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise
    return CustomListMembershipResponse(
        membership=membership,
        item_ids=item_ids,
    )


@router.get(
    '/me/library-status',
    response_model=TitleLibraryStatusResponse,
)
async def title_library_status(
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    response: Response,
    type: Annotated[str, Query(min_length=1, max_length=16)],
    id: Annotated[uuid.UUID, Query()],
) -> TitleLibraryStatusResponse:
    """Combined watchlist / favorites / diary / custom-list status for one title.

    Orchestrated in the API layer so ``lists`` and ``library`` domain modules
    stay independent (import-linter). Shares the diary ``contains`` rate-limit
    bucket so combining calls does not bypass abuse controls.
    """
    response.headers['Cache-Control'] = 'private, no-store'
    await enforce_watch_entries_contains_rate_limit(
        get_cache(),
        settings=settings,
        identity_id=identity.id,
    )
    try:
        watch_membership = await lists_service.system_list_contains(
            session,
            identity_id=identity.id,
            kind='watchlist',
            refs=[(type, id)],
        )
        fav_membership = await lists_service.system_list_contains(
            session,
            identity_id=identity.id,
            kind='favorites',
            refs=[(type, id)],
        )
        logged = await library_service.contains_logged_titles(
            session,
            identity_id=identity.id,
            refs=[(type, id)],
        )
        (
            list_membership,
            list_item_ids,
        ) = await lists_service.custom_lists_membership_for_content(
            session,
            identity_id=identity.id,
            content_type=type,
            content_id=id,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        if isinstance(exc, library_service.ProfileRequiredError):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='Profile not found',
            ) from exc
        if isinstance(exc, library_service.UnsupportedWatchContentError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(exc) or 'Unsupported content type',
            ) from exc
        raise
    # Single-ref calls: membership dicts are keyed by normalized public type.
    return TitleLibraryStatusResponse(
        in_watchlist=any(watch_membership.values()),
        in_favorites=any(fav_membership.values()),
        has_logged=any(logged.membership.values()),
        list_membership=list_membership,
        list_item_ids=list_item_ids,
    )


@router.get('/lists/{list_id}', response_model=CustomListDetailResponse)
async def get_custom_list(
    list_id: uuid.UUID,
    identity: OptionalIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> CustomListDetailResponse:
    """Return custom list metadata (system kinds → 404)."""
    await enforce_users_public_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        return await lists_service.get_custom_list(
            session,
            list_id=list_id,
            identity_id=None if identity is None else identity.id,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise


@router.patch('/lists/{list_id}', response_model=CustomListDetailResponse)
async def patch_custom_list(
    list_id: uuid.UUID,
    body: PatchCustomListBody,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> CustomListDetailResponse:
    """Update custom list metadata (owner only; system kinds → 404)."""
    cache = get_cache()
    await enforce_lists_write_rate_limit(
        cache,
        settings=settings,
        identity_id=identity.id,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        return await lists_service.patch_custom_list(
            session,
            identity_id=identity.id,
            list_id=list_id,
            title=body.title,
            description=body.description,
            visibility=body.visibility,
            description_set='description' in body.model_fields_set,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise


@router.delete('/lists/{list_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_list(
    list_id: uuid.UUID,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> Response:
    """Hard-delete a custom list (system kinds → 404)."""
    cache = get_cache()
    await enforce_lists_write_rate_limit(
        cache,
        settings=settings,
        identity_id=identity.id,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        await lists_service.delete_custom_list(
            session,
            identity_id=identity.id,
            list_id=list_id,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get('/lists/{list_id}/items', response_model=CustomListItemsResponse)
async def get_custom_list_items(
    list_id: uuid.UUID,
    identity: OptionalIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=500)] = 24,
) -> CustomListItemsResponse:
    """Paginated items for a readable custom list (system kinds → 404)."""
    await enforce_users_public_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        return await lists_service.get_custom_list_items(
            session,
            list_id=list_id,
            identity_id=None if identity is None else identity.id,
            page=page,
            limit=limit,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise


@router.post(
    '/lists/{list_id}/items',
    response_model=ListItemResponse,
    status_code=status.HTTP_200_OK,
)
async def add_custom_list_item(
    list_id: uuid.UUID,
    body: ContentRefBody,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> ListItemResponse:
    """Add a title to a custom list (idempotent; system kinds → 404)."""
    cache = get_cache()
    await enforce_lists_write_rate_limit(
        cache,
        settings=settings,
        identity_id=identity.id,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        return await lists_service.add_custom_list_item(
            session,
            identity_id=identity.id,
            list_id=list_id,
            content_type=body.type,
            content_id=body.id,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise


@router.delete(
    '/lists/{list_id}/items/{item_id}',
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_custom_list_item(
    list_id: uuid.UUID,
    item_id: uuid.UUID,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> Response:
    """Remove an item and compact positions (system kinds → 404)."""
    cache = get_cache()
    await enforce_lists_write_rate_limit(
        cache,
        settings=settings,
        identity_id=identity.id,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        await lists_service.remove_custom_list_item(
            session,
            identity_id=identity.id,
            list_id=list_id,
            item_id=item_id,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get('/lists/{list_id}/contains', response_model=ContainsResponse)
async def custom_list_contains(
    list_id: uuid.UUID,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    ids: Annotated[
        list[str],
        Query(description='Repeated type:uuid tokens, e.g. movie:<uuid>'),
    ],
) -> ContainsResponse:
    """Batch membership for one custom list (owner only; system → 404)."""
    refs = _parse_contains_ids(ids)
    try:
        membership = await lists_service.custom_list_contains(
            session,
            identity_id=identity.id,
            list_id=list_id,
            refs=refs,
        )
    except Exception as exc:
        mapped = _map_domain_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise
    return ContainsResponse(membership=membership)
