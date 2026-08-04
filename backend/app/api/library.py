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
from app.library.rate_limit import enforce_watch_entries_contains_rate_limit
from app.library.schemas import (
    CreateWatchEntryBody,
    PatchWatchEntryBody,
    WatchEntriesContainsResponse,
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


@router.get(
    '/me/watch-entries/contains',
    response_model=WatchEntriesContainsResponse,
)
async def watch_entries_contains(
    identity: CurrentIdentityDep,
    session: DbSessionDep,
    settings: SettingsDep,
    ids: Annotated[list[str], Query(min_length=1)],
) -> WatchEntriesContainsResponse:
    """Batch check whether the caller has logged each title at least once."""
    await enforce_watch_entries_contains_rate_limit(
        get_cache(),
        settings=settings,
        identity_id=identity.id,
    )
    refs = _parse_contains_ids(ids)
    try:
        return await library_service.contains_logged_titles(
            session,
            identity_id=identity.id,
            refs=refs,
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
    """Log a watch and remove the title from watchlist in one commit."""
    cache = get_cache()
    await enforce_lists_write_rate_limit(
        cache,
        settings=settings,
        identity_id=identity.id,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        # Create first, then watchlist remove — never remove-before-create.
        entry = await library_service.create_entry(
            session,
            identity_id=identity.id,
            content_type=body.type,
            content_id=body.id,
            watched_at=body.watched_at,
            note=body.note,
            rating=body.rating,
            commit=False,
        )
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
    """Edit watched_at, note, and/or rating on a diary entry."""
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
            rating=body.rating,
            rating_set='rating' in body.model_fields_set,
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
