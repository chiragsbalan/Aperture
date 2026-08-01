"""Lists domain service: system lists, custom lists, AuthZ, content validation."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.content_refs import (
    UnsupportedContentTypeError,
    to_db_content_type,
    to_public_content_type,
)
from app.core.cache import CacheBackend, CacheBackendError
from app.lists import repository as lists_repository
from app.lists.cache_keys import system_list_key
from app.lists.models import List, ListItem
from app.lists.schemas import (
    ContentSummary,
    CustomListDetailResponse,
    CustomListItemsResponse,
    CustomListSummary,
    ListItemResponse,
    SystemListResponse,
)
from app.metadata import service as metadata_service
from app.users import service as users_service

logger = logging.getLogger(__name__)

MAX_ITEMS_PER_LIST = 500
MAX_CUSTOM_LISTS = 50
SYSTEM_KINDS = frozenset({'watchlist', 'favorites'})
VISIBILITIES = frozenset({'private', 'public', 'unlisted'})


class ProfileRequiredError(Exception):
    """Authenticated identity has no Users profile."""


class ContentNotFoundError(Exception):
    """Referenced Aperture content id does not exist."""


class UnsupportedListContentError(Exception):
    """Content type is not allowed on lists (e.g. person)."""


class ListCapacityError(Exception):
    """List item cap exceeded."""


class CustomListCapacityError(Exception):
    """Per-user custom list cap exceeded."""


class ListNotFoundError(Exception):
    """List missing, not custom, or not visible to the caller."""


class ReorderMismatchError(Exception):
    """Reorder body is not set-equal to current membership."""


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


async def _items_with_summaries(
    session: AsyncSession,
    items: list[ListItem],
) -> list[ListItemResponse]:
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
    return response_items


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
    response_items = await _items_with_summaries(session, items)
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
    commit: bool = True,
) -> uuid.UUID:
    """Remove a title from a system list (idempotent if absent).

    Does not lazy-create an empty system list when none exists. When
    ``commit`` is False, only flush so the caller can compose a larger
    transaction (e.g. diary create + watchlist remove). Cache invalidation
    runs only after a successful commit from this function. Returns the
    owner user id so callers can invalidate after an external commit.
    """
    if kind not in SYSTEM_KINDS:
        raise ValueError(f'not a system list kind: {kind}')
    ref = _parse_ref(content_type=content_type, content_id=content_id)
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    list_row = await lists_repository.get_system_list(
        session,
        owner_user_id=owner_user_id,
        kind=kind,
    )
    if list_row is None:
        return owner_user_id

    locked = await lists_repository.lock_list(session, list_id=list_row.id)
    if locked is None:
        return owner_user_id

    await lists_repository.delete_item_by_content(
        session,
        list_id=locked.id,
        content_type=ref.db_type,
        content_id=ref.content_id,
    )
    if not commit:
        await session.flush()
        return owner_user_id
    await session.commit()
    await _invalidate_system_list_cache(
        cache,
        user_id=owner_user_id,
        kind=kind,
    )
    return owner_user_id


async def invalidate_system_list_cache_for_user(
    cache: CacheBackend | None,
    *,
    user_id: uuid.UUID,
    kind: str,
) -> None:
    """Invalidate system list cache for a known owner user id."""
    await _invalidate_system_list_cache(cache, user_id=user_id, kind=kind)


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


def _summary_from_row(list_row: List, item_count: int) -> CustomListSummary:
    return CustomListSummary(
        id=list_row.id,
        title=list_row.title,
        description=list_row.description,
        visibility=list_row.visibility,  # type: ignore[arg-type]
        item_count=item_count,
        created_at=list_row.created_at,
        updated_at=list_row.updated_at,
    )


def _detail_from_row(
    list_row: List,
    item_count: int,
    *,
    is_owner: bool,
) -> CustomListDetailResponse:
    return CustomListDetailResponse(
        id=list_row.id,
        title=list_row.title,
        description=list_row.description,
        visibility=list_row.visibility,  # type: ignore[arg-type]
        owner_user_id=list_row.owner_user_id if is_owner else None,
        is_owner=is_owner,
        item_count=item_count,
        created_at=list_row.created_at,
        updated_at=list_row.updated_at,
    )


async def _viewer_user_id(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID | None,
) -> uuid.UUID | None:
    if identity_id is None:
        return None
    profile = await users_service.get_profile_for_identity(
        session,
        identity_id=identity_id,
    )
    if profile is None:
        return None
    return profile.id


async def require_custom_list_mutable(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    list_id: uuid.UUID,
) -> List:
    """Return a locked custom list owned by the caller, else ListNotFoundError.

    System kinds and missing/non-owned lists all surface as not found (404).
    """
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    locked = await lists_repository.lock_list(session, list_id=list_id)
    if locked is None or locked.kind != 'custom':
        raise ListNotFoundError('list not found')
    if locked.owner_user_id != owner_user_id:
        raise ListNotFoundError('list not found')
    return locked


async def _resolve_readable_custom_list(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    identity_id: uuid.UUID | None,
) -> List:
    """Resolve a custom list for read access under visibility rules."""
    list_row = await lists_repository.get_list_by_id(session, list_id=list_id)
    if list_row is None or list_row.kind != 'custom':
        raise ListNotFoundError('list not found')

    if list_row.visibility in {'public', 'unlisted'}:
        return list_row

    # private
    if identity_id is None:
        raise ListNotFoundError('list not found')
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    if list_row.owner_user_id != owner_user_id:
        raise ListNotFoundError('list not found')
    return list_row


async def list_my_custom_lists(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
) -> list[CustomListSummary]:
    """Return the caller's custom lists with item counts."""
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    rows = await lists_repository.list_custom_lists(
        session,
        owner_user_id=owner_user_id,
    )
    return [_summary_from_row(list_row, count) for list_row, count in rows]


async def create_custom_list(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    title: str,
    description: str | None,
    visibility: str,
) -> CustomListDetailResponse:
    """Create a custom list for the authenticated user."""
    if visibility not in VISIBILITIES:
        raise UnsupportedListContentError('invalid visibility')
    cleaned_title = title.strip()
    if not cleaned_title:
        raise UnsupportedListContentError('title required')
    cleaned_description = description.strip() if description else None
    if cleaned_description == '':
        cleaned_description = None

    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    locked_rows = await lists_repository.lock_custom_lists_for_owner(
        session,
        owner_user_id=owner_user_id,
    )
    if len(locked_rows) >= MAX_CUSTOM_LISTS:
        raise CustomListCapacityError('custom list limit reached')

    list_row = await lists_repository.insert_custom_list(
        session,
        owner_user_id=owner_user_id,
        title=cleaned_title,
        description=cleaned_description,
        visibility=visibility,
    )
    await session.commit()
    return _detail_from_row(list_row, 0, is_owner=True)


async def get_custom_list(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    identity_id: uuid.UUID | None,
) -> CustomListDetailResponse:
    """Return custom list metadata when visible to the caller."""
    list_row = await _resolve_readable_custom_list(
        session,
        list_id=list_id,
        identity_id=identity_id,
    )
    viewer_user_id = await _viewer_user_id(session, identity_id=identity_id)
    is_owner = viewer_user_id is not None and viewer_user_id == list_row.owner_user_id
    item_count = await lists_repository.count_items(session, list_id=list_row.id)
    return _detail_from_row(list_row, item_count, is_owner=is_owner)


async def patch_custom_list(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    list_id: uuid.UUID,
    title: str | None,
    description: str | None,
    visibility: str | None,
    description_set: bool,
) -> CustomListDetailResponse:
    """Update custom list metadata (owner only)."""
    locked = await require_custom_list_mutable(
        session,
        identity_id=identity_id,
        list_id=list_id,
    )
    if title is not None:
        cleaned = title.strip()
        if not cleaned:
            raise UnsupportedListContentError('title required')
        locked.title = cleaned
    if description_set:
        if description is None:
            locked.description = None
        else:
            cleaned_desc = description.strip()
            locked.description = cleaned_desc or None
    if visibility is not None:
        if visibility not in VISIBILITIES:
            raise UnsupportedListContentError('invalid visibility')
        locked.visibility = visibility
    await session.commit()
    await session.refresh(locked)
    item_count = await lists_repository.count_items(session, list_id=locked.id)
    return _detail_from_row(locked, item_count, is_owner=True)


async def delete_custom_list(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    list_id: uuid.UUID,
) -> None:
    """Hard-delete a custom list (cascades items)."""
    locked = await require_custom_list_mutable(
        session,
        identity_id=identity_id,
        list_id=list_id,
    )
    await lists_repository.delete_list(session, list_id=locked.id)
    await session.commit()


async def get_custom_list_items(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    identity_id: uuid.UUID | None,
    page: int,
    limit: int,
) -> CustomListItemsResponse:
    """Return paginated items for a readable custom list."""
    list_row = await _resolve_readable_custom_list(
        session,
        list_id=list_id,
        identity_id=identity_id,
    )
    total = await lists_repository.count_items(session, list_id=list_row.id)
    offset = (page - 1) * limit
    items = await lists_repository.list_items_page(
        session,
        list_id=list_row.id,
        offset=offset,
        limit=limit,
    )
    response_items = await _items_with_summaries(session, items)
    return CustomListItemsResponse(
        list_id=list_row.id,
        page=page,
        limit=limit,
        total=total,
        items=response_items,
    )


async def add_custom_list_item(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    list_id: uuid.UUID,
    content_type: str,
    content_id: uuid.UUID,
) -> ListItemResponse:
    """Add a title to a custom list (idempotent if already present)."""
    ref = _parse_ref(content_type=content_type, content_id=content_id)
    await _validate_content_exists(session, ref=ref)
    locked = await require_custom_list_mutable(
        session,
        identity_id=identity_id,
        list_id=list_id,
    )

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

    position = await lists_repository.next_position(session, list_id=locked.id)
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
    summaries = await metadata_service.get_content_summaries(
        session,
        refs=[(ref.db_type, ref.content_id)],
    )
    if not summaries:
        raise ContentNotFoundError('content not found')
    return _item_response(item, summaries[0])


async def remove_custom_list_item(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    list_id: uuid.UUID,
    item_id: uuid.UUID,
) -> None:
    """Remove an item and compact positions to ``0..n-1``."""
    locked = await require_custom_list_mutable(
        session,
        identity_id=identity_id,
        list_id=list_id,
    )
    deleted = await lists_repository.delete_item_by_id(
        session,
        list_id=locked.id,
        item_id=item_id,
    )
    if deleted:
        remaining = await lists_repository.list_all_item_ids(
            session,
            list_id=locked.id,
        )
        await lists_repository.renumber_positions(
            session,
            list_id=locked.id,
            ordered_item_ids=remaining,
        )
    await session.commit()


async def reorder_custom_list_items(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    list_id: uuid.UUID,
    item_ids: list[uuid.UUID],
) -> CustomListItemsResponse:
    """Set item order. ``item_ids`` must be set-equal to current membership.

    Positions are renumbered densely to ``0..n-1`` under ``lock_list`` (not
    fractional indexing). Acceptable while lists are capped at 500 items.
    """
    locked = await require_custom_list_mutable(
        session,
        identity_id=identity_id,
        list_id=list_id,
    )
    current_ids = await lists_repository.list_all_item_ids(
        session,
        list_id=locked.id,
    )
    if set(item_ids) != set(current_ids) or len(item_ids) != len(current_ids):
        raise ReorderMismatchError('item_ids must match list membership')

    await lists_repository.renumber_positions(
        session,
        list_id=locked.id,
        ordered_item_ids=item_ids,
    )
    await session.commit()

    items = await lists_repository.list_items_page(
        session,
        list_id=locked.id,
        offset=0,
        limit=MAX_ITEMS_PER_LIST,
    )
    response_items = await _items_with_summaries(session, items)
    return CustomListItemsResponse(
        list_id=locked.id,
        page=1,
        limit=MAX_ITEMS_PER_LIST,
        total=len(response_items),
        items=response_items,
    )


async def custom_list_contains(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    list_id: uuid.UUID,
    refs: list[tuple[str, uuid.UUID]],
) -> dict[str, bool]:
    """Batch membership for one custom list (owner only)."""
    await require_custom_list_mutable(
        session,
        identity_id=identity_id,
        list_id=list_id,
    )
    parsed: list[tuple[str, str, uuid.UUID]] = []
    for content_type, content_id in refs:
        try:
            ref = _parse_ref(content_type=content_type, content_id=content_id)
        except UnsupportedListContentError:
            continue
        parsed.append((ref.public_type, ref.db_type, ref.content_id))

    present = await lists_repository.membership_for_refs(
        session,
        list_id=list_id,
        refs=[(db_type, content_id) for _, db_type, content_id in parsed],
    )
    membership: dict[str, bool] = {}
    for public_type, db_type, content_id in parsed:
        key = f'{public_type}:{content_id}'
        membership[key] = (db_type, content_id) in present
    return membership


async def custom_lists_membership_for_content(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    content_type: str,
    content_id: uuid.UUID,
) -> tuple[dict[str, bool], dict[str, uuid.UUID]]:
    """Return membership and item ids for all of the owner's custom lists."""
    ref = _parse_ref(content_type=content_type, content_id=content_id)
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    (
        membership_raw,
        item_ids_raw,
    ) = await lists_repository.custom_list_membership_for_content(
        session,
        owner_user_id=owner_user_id,
        content_type=ref.db_type,
        content_id=ref.content_id,
    )
    membership = {str(list_id): present for list_id, present in membership_raw.items()}
    item_ids = {str(list_id): item_id for list_id, item_id in item_ids_raw.items()}
    return membership, item_ids
