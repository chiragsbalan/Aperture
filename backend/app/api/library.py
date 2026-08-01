"""Diary HTTP routes: watch_entries under ``/api/v1/me/watch-entries``."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.auth.deps import CurrentIdentityDep
from app.core.cache import get_cache
from app.core.deps import DbSessionDep, SettingsDep
from app.core.trusted_client import resolve_client_ip
from app.library import service as library_service
from app.library.schemas import (
    CreateWatchEntryBody,
    PatchWatchEntryBody,
    WatchEntriesPageResponse,
    WatchEntryResponse,
)
from app.lists import service as lists_service
from app.lists.rate_limit import enforce_lists_write_rate_limit

router = APIRouter(tags=['library'])


def _map_library_error(exc: Exception) -> HTTPException | None:
    if isinstance(exc, library_service.ProfileRequiredError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Profile not found',
        )
    if isinstance(exc, library_service.ContentNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Content not found',
        )
    if isinstance(exc, library_service.UnsupportedWatchContentError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc) or 'Unsupported watch entry input',
        )
    if isinstance(exc, library_service.WatchEntryNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Watch entry not found',
        )
    return None


def _map_lists_error(exc: Exception) -> HTTPException | None:
    if isinstance(exc, lists_service.ProfileRequiredError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Profile not found',
        )
    if isinstance(exc, lists_service.UnsupportedListContentError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='Unsupported content type for lists',
        )
    return None


@router.get('/me/watch-entries', response_model=WatchEntriesPageResponse)
async def list_watch_entries(
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
    year: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
) -> WatchEntriesPageResponse:
    """Return the authenticated user's diary feed."""
    try:
        return await library_service.list_entries(
            session,
            identity_id=identity.id,
            page=page,
            limit=limit,
            year=year,
            month=month,
        )
    except Exception as exc:
        mapped = _map_library_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise


@router.post(
    '/me/watch-entries',
    response_model=WatchEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_watch_entry(
    body: CreateWatchEntryBody,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> WatchEntryResponse:
    """Log a watch. Optionally remove the title from watchlist in one commit."""
    cache = get_cache()
    await enforce_lists_write_rate_limit(
        cache,
        settings=settings,
        identity_id=identity.id,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        # Create first, then optional watchlist remove — never remove-before-create.
        entry = await library_service.create_entry(
            session,
            identity_id=identity.id,
            content_type=body.type,
            content_id=body.id,
            watched_at=body.watched_at,
            note=body.note,
            commit=False,
        )
        owner_user_id: uuid.UUID | None = None
        if body.remove_from_watchlist:
            owner_user_id = await lists_service.remove_system_list_item(
                session,
                cache=cache,
                identity_id=identity.id,
                kind='watchlist',
                content_type=body.type,
                content_id=body.id,
                commit=False,
            )
        await session.commit()
        if owner_user_id is not None:
            await lists_service.invalidate_system_list_cache_for_user(
                cache,
                user_id=owner_user_id,
                kind='watchlist',
            )
        return entry
    except Exception as exc:
        await session.rollback()
        mapped = _map_library_error(exc) or _map_lists_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise


@router.patch(
    '/me/watch-entries/{entry_id}',
    response_model=WatchEntryResponse,
)
async def patch_watch_entry(
    entry_id: uuid.UUID,
    body: PatchWatchEntryBody,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> WatchEntryResponse:
    """Edit watched_at and/or note on a diary entry."""
    cache = get_cache()
    await enforce_lists_write_rate_limit(
        cache,
        settings=settings,
        identity_id=identity.id,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        return await library_service.patch_entry(
            session,
            identity_id=identity.id,
            entry_id=entry_id,
            watched_at=body.watched_at,
            note=body.note,
            note_set='note' in body.model_fields_set,
        )
    except Exception as exc:
        mapped = _map_library_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise


@router.delete(
    '/me/watch-entries/{entry_id}',
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_watch_entry(
    entry_id: uuid.UUID,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    request: Request,
) -> Response:
    """Delete a diary entry."""
    cache = get_cache()
    await enforce_lists_write_rate_limit(
        cache,
        settings=settings,
        identity_id=identity.id,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        await library_service.delete_entry(
            session,
            identity_id=identity.id,
            entry_id=entry_id,
        )
    except Exception as exc:
        mapped = _map_library_error(exc)
        if mapped is not None:
            raise mapped from exc
        raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)
