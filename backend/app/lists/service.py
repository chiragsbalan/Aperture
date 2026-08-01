"""Lists domain service: system lists, AuthZ, content validation."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheBackend, CacheBackendError
from app.lists import repository as lists_repository
from app.lists.cache_keys import system_list_key
from app.lists.content_refs import (
    UnsupportedContentTypeError,
    to_db_content_type,
    to_public_content_type,
)
from app.lists.models import List, ListItem
from app.lists.schemas import (
    ContentSummary,
    ListItemResponse,
    SystemListResponse,
)
from app.metadata import service as metadata_service
from app.users import service as users_service

logger = logging.getLogger(__name__)

MAX_ITEMS_PER_LIST = 500
SYSTEM_KINDS = frozenset({'watchlist', 'favorites'})


class ProfileRequiredError(Exception):
    """Authenticated identity has no Users profile."""


class ContentNotFoundError(Exception):
    """Referenced Aperture content id does not exist."""


class UnsupportedListContentError(Exception):
    """Content type is not allowed on lists (e.g. person)."""


class ListCapacityError(Exception):
    """List item cap exceeded."""


@dataclass(frozen=True, slots=True)
class ParsedRef:
    """Normalized content pointer for persistence."""

    db_type: str
    content_id: uuid.UUID
    public_type: str


async def _require_owner_user_id(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
) -> uuid.UUID:
    profile = await users_service.get_profile_for_identity(
        session,
        identity_id=identity_id,
    )
    if profile is None:
        raise ProfileRequiredError('profile not found')
    return profile.id


def _parse_ref(*, content_type: str, content_id: uuid.UUID) -> ParsedRef:
    try:
        db_type = to_db_content_type(content_type)
    except UnsupportedContentTypeError as exc:
        raise UnsupportedListContentError(str(exc)) from exc
    return ParsedRef(
        db_type=db_type,
        content_id=content_id,
        public_type=to_public_content_type(db_type),
    )


async def _validate_content_exists(
    session: AsyncSession,
    *,
    ref: ParsedRef,
) -> None:
    exists = await metadata_service.content_exists(
        session,
        content_type=ref.db_type,
        content_id=ref.content_id,
    )
    if not exists:
        raise ContentNotFoundError('content not found')


async def _invalidate_system_list_cache(
    cache: CacheBackend | None,
    *,
    user_id: uuid.UUID,
    kind: str,
) -> None:
    if cache is None:
        return
    key = system_list_key(user_id=user_id, kind=kind)
    try:
        await cache.delete(key)
    except CacheBackendError:
        logger.warning('failed to invalidate list cache key %s', key)


async def get_or_create_system_list(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    kind: str,
) -> List:
    """Lazy-create a system list for the authenticated user."""
    if kind not in SYSTEM_KINDS:
        raise ValueError(f'not a system list kind: {kind}')
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    existing = await lists_repository.get_system_list(
        session,
        owner_user_id=owner_user_id,
        kind=kind,
    )
    if existing is not None:
        return existing

    list_row = List(
        owner_user_id=owner_user_id,
        kind=kind,
        title=lists_repository.SYSTEM_TITLES[kind],
        description=None,
        visibility='private',
    )
    try:
        async with session.begin_nested():
            session.add(list_row)
            await session.flush()
        return list_row
    except IntegrityError:
        created = await lists_repository.get_system_list(
            session,
            owner_user_id=owner_user_id,
            kind=kind,
        )
        if created is None:
            raise
        return created


def _item_response(
    item: ListItem,
    summary: metadata_service.ContentSummaryDTO,
) -> ListItemResponse:
    return ListItemResponse(
        item_id=item.id,
        position=item.position,
        added_at=item.created_at,
        content=ContentSummary(
            type=to_public_content_type(summary.content_type),
            id=summary.id,
            title=summary.title,
            year=summary.year,
            poster_url=summary.poster_url,
        ),
    )


async def get_system_list_page(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    kind: str,
    page: int,
    limit: int,
) -> SystemListResponse:
    """Return a paginated system list with Metadata summaries."""
    list_row = await get_or_create_system_list(
        session,
        identity_id=identity_id,
        kind=kind,
    )
    await session.commit()
    total = await lists_repository.count_items(session, list_id=list_row.id)
    offset = (page - 1) * limit
    items = await lists_repository.list_items_page(
        session,
        list_id=list_row.id,
        offset=offset,
        limit=limit,
    )
    refs = [(item.content_type, item.content_id) for item in items]
    summaries = await metadata_service.get_content_summaries(session, refs=refs)
    summary_by_key = {(row.content_type, row.id): row for row in summaries}
    response_items: list[ListItemResponse] = []
    for item in items:
        summary = summary_by_key.get((item.content_type, item.content_id))
        if summary is None:
            response_items.append(
                ListItemResponse(
                    item_id=item.id,
                    position=item.position,
                    added_at=item.created_at,
                    content=ContentSummary(
                        type=to_public_content_type(item.content_type),
                        id=item.content_id,
                        title='Unavailable title',
                        year=None,
                        poster_url=None,
                    ),
                )
            )
            continue
        response_items.append(_item_response(item, summary))

    return SystemListResponse(
        kind=kind,  # type: ignore[arg-type]
        title=list_row.title,
        page=page,
        limit=limit,
        total=total,
        items=response_items,
    )


async def add_system_list_item(
    session: AsyncSession,
    *,
    cache: CacheBackend | None,
    identity_id: uuid.UUID,
    kind: str,
    content_type: str,
    content_id: uuid.UUID,
) -> ListItemResponse:
    """Add a title to a system list (idempotent if already present)."""
    ref = _parse_ref(content_type=content_type, content_id=content_id)
    await _validate_content_exists(session, ref=ref)
    list_row = await get_or_create_system_list(
        session,
        identity_id=identity_id,
        kind=kind,
    )
    locked = await lists_repository.lock_list(session, list_id=list_row.id)
    if locked is None:
        raise ProfileRequiredError('profile not found')

    existing = await lists_repository.get_item_by_content(
        session,
        list_id=locked.id,
        content_type=ref.db_type,
        content_id=ref.content_id,
    )
    if existing is not None:
        summaries = await metadata_service.get_content_summaries(
            session,
            refs=[(ref.db_type, ref.content_id)],
        )
        if not summaries:
            raise ContentNotFoundError('content not found')
        return _item_response(existing, summaries[0])

    count = await lists_repository.count_items(session, list_id=locked.id)
    if count >= MAX_ITEMS_PER_LIST:
        raise ListCapacityError('list item limit reached')

    position = await lists_repository.next_position(
        session,
        list_id=locked.id,
    )
    try:
        async with session.begin_nested():
            item = await lists_repository.insert_item(
                session,
                list_id=locked.id,
                content_type=ref.db_type,
                content_id=ref.content_id,
                position=position,
            )
    except IntegrityError:
        existing = await lists_repository.get_item_by_content(
            session,
            list_id=locked.id,
            content_type=ref.db_type,
            content_id=ref.content_id,
        )
        if existing is None:
            raise
        item = existing

    await session.commit()
    await _invalidate_system_list_cache(
        cache,
        user_id=locked.owner_user_id,
        kind=kind,
    )
    summaries = await metadata_service.get_content_summaries(
        session,
        refs=[(ref.db_type, ref.content_id)],
    )
    if not summaries:
        raise ContentNotFoundError('content not found')
    return _item_response(item, summaries[0])


async def remove_system_list_item(
    session: AsyncSession,
    *,
    cache: CacheBackend | None,
    identity_id: uuid.UUID,
    kind: str,
    content_type: str,
    content_id: uuid.UUID,
) -> None:
    """Remove a title from a system list (idempotent if absent)."""
    ref = _parse_ref(content_type=content_type, content_id=content_id)
    list_row = await get_or_create_system_list(
        session,
        identity_id=identity_id,
        kind=kind,
    )
    await lists_repository.delete_item_by_content(
        session,
        list_id=list_row.id,
        content_type=ref.db_type,
        content_id=ref.content_id,
    )
    await session.commit()
    await _invalidate_system_list_cache(
        cache,
        user_id=list_row.owner_user_id,
        kind=kind,
    )


async def system_list_contains(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    kind: str,
    refs: list[tuple[str, uuid.UUID]],
) -> dict[str, bool]:
    """Batch membership check. Keys are ``{public_type}:{id}``."""
    list_row = await get_or_create_system_list(
        session,
        identity_id=identity_id,
        kind=kind,
    )
    await session.commit()
    parsed: list[tuple[str, str, uuid.UUID]] = []
    for content_type, content_id in refs:
        try:
            ref = _parse_ref(content_type=content_type, content_id=content_id)
        except UnsupportedListContentError:
            continue
        parsed.append((ref.public_type, ref.db_type, ref.content_id))

    present = await lists_repository.membership_for_refs(
        session,
        list_id=list_row.id,
        refs=[(db_type, content_id) for _, db_type, content_id in parsed],
    )
    membership: dict[str, bool] = {}
    for public_type, db_type, content_id in parsed:
        key = f'{public_type}:{content_id}'
        membership[key] = (db_type, content_id) in present
    return membership
