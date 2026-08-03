"""Persistence helpers for lists and list items."""

from __future__ import annotations

import uuid
from typing import Any, cast

from sqlalchemy import delete, func, select, tuple_, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.lists.models import List, ListItem

SYSTEM_TITLES: dict[str, str] = {
    'watchlist': 'Watchlist',
    'favorites': 'Favorites',
}


async def get_system_list(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    kind: str,
    for_update: bool = False,
) -> List | None:
    """Return an existing system list for the owner, if any."""
    stmt = select(List).where(
        List.owner_user_id == owner_user_id,
        List.kind == kind,
    )
    if for_update:
        stmt = stmt.with_for_update()
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_list_by_id(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    for_update: bool = False,
) -> List | None:
    """Return a list row by id."""
    stmt = select(List).where(List.id == list_id)
    if for_update:
        stmt = stmt.with_for_update()
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def lock_list(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
) -> List | None:
    """Lock a list row for capacity/position updates."""
    return await get_list_by_id(session, list_id=list_id, for_update=True)


async def count_items(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
) -> int:
    """Return the number of items on a list."""
    result = await session.execute(
        select(func.count()).select_from(ListItem).where(ListItem.list_id == list_id)
    )
    return int(result.scalar_one())


async def lock_custom_lists_for_owner(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
) -> list[List]:
    """Lock all custom list rows for an owner (capacity check).

    Rows are locked in ``id`` order to keep multi-row lock acquisition
    consistent with other list mutations and reduce deadlock risk.
    """
    result = await session.execute(
        select(List)
        .where(
            List.owner_user_id == owner_user_id,
            List.kind == 'custom',
        )
        .order_by(List.id.asc())
        .with_for_update()
    )
    return list(result.scalars().all())


async def count_custom_lists(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    visibility: str | None = None,
) -> int:
    """Count custom lists for an owner, optionally filtered by visibility."""
    stmt = (
        select(func.count())
        .select_from(List)
        .where(
            List.owner_user_id == owner_user_id,
            List.kind == 'custom',
        )
    )
    if visibility is not None:
        stmt = stmt.where(List.visibility == visibility)
    result = await session.execute(stmt)
    return int(result.scalar_one())


async def list_custom_lists(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
) -> list[tuple[List, int]]:
    """Return custom lists for an owner with item counts (newest first)."""
    item_count = (
        select(func.count())
        .select_from(ListItem)
        .where(ListItem.list_id == List.id)
        .correlate(List)
        .scalar_subquery()
    )
    result = await session.execute(
        select(List, item_count)
        .where(List.owner_user_id == owner_user_id, List.kind == 'custom')
        .order_by(List.updated_at.desc(), List.created_at.desc())
    )
    rows: list[tuple[List, int]] = []
    for list_row, count in result.all():
        rows.append((list_row, int(count or 0)))
    return rows


async def insert_custom_list(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    title: str,
    description: str | None,
    visibility: str,
) -> List:
    """Insert a custom list row."""
    list_row = List(
        owner_user_id=owner_user_id,
        kind='custom',
        title=title,
        description=description,
        visibility=visibility,
    )
    session.add(list_row)
    await session.flush()
    return list_row


async def delete_list(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
) -> bool:
    """Hard-delete a list (cascades items). Returns True when a row was removed."""
    result = cast(
        CursorResult[Any],
        await session.execute(delete(List).where(List.id == list_id)),
    )
    return (result.rowcount or 0) > 0


async def next_position(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
) -> int:
    """Return the next append position (max + 1, or 0 when empty)."""
    result = await session.execute(
        select(func.coalesce(func.max(ListItem.position), -1)).where(
            ListItem.list_id == list_id
        )
    )
    return int(result.scalar_one()) + 1


async def get_item_by_content(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    content_type: str,
    content_id: uuid.UUID,
) -> ListItem | None:
    """Return a membership row for a content ref, if present."""
    result = await session.execute(
        select(ListItem).where(
            ListItem.list_id == list_id,
            ListItem.content_type == content_type,
            ListItem.content_id == content_id,
        )
    )
    return result.scalar_one_or_none()


async def get_item_by_id(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    item_id: uuid.UUID,
) -> ListItem | None:
    """Return an item belonging to the given list."""
    result = await session.execute(
        select(ListItem).where(
            ListItem.id == item_id,
            ListItem.list_id == list_id,
        )
    )
    return result.scalar_one_or_none()


async def list_items_page(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    offset: int,
    limit: int,
) -> list[ListItem]:
    """Return ordered items for a page."""
    result = await session.execute(
        select(ListItem)
        .where(ListItem.list_id == list_id)
        .order_by(ListItem.position.asc(), ListItem.created_at.asc())
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all())


async def list_all_item_ids(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
) -> list[uuid.UUID]:
    """Return all item ids in position order."""
    result = await session.execute(
        select(ListItem.id)
        .where(ListItem.list_id == list_id)
        .order_by(ListItem.position.asc(), ListItem.created_at.asc())
    )
    return list(result.scalars().all())


async def insert_item(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    content_type: str,
    content_id: uuid.UUID,
    position: int,
) -> ListItem:
    """Insert a list item row."""
    item = ListItem(
        list_id=list_id,
        content_type=content_type,
        content_id=content_id,
        position=position,
    )
    session.add(item)
    await session.flush()
    return item


async def delete_item_by_content(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    content_type: str,
    content_id: uuid.UUID,
) -> bool:
    """Delete a membership row. Returns True when a row was removed."""
    result = cast(
        CursorResult[Any],
        await session.execute(
            delete(ListItem).where(
                ListItem.list_id == list_id,
                ListItem.content_type == content_type,
                ListItem.content_id == content_id,
            )
        ),
    )
    return (result.rowcount or 0) > 0


async def delete_item_by_id(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    item_id: uuid.UUID,
) -> bool:
    """Delete a membership row by id. Returns True when removed."""
    result = cast(
        CursorResult[Any],
        await session.execute(
            delete(ListItem).where(
                ListItem.id == item_id,
                ListItem.list_id == list_id,
            )
        ),
    )
    return (result.rowcount or 0) > 0


async def renumber_positions(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    ordered_item_ids: list[uuid.UUID],
) -> None:
    """Assign dense positions ``0..n-1`` for ``ordered_item_ids``.

    Reorder uses transaction + renumber (not fractional indexing). Lists are
    capped at 500 items, so rewriting positions under ``lock_list`` is
    acceptable for P3.3.
    """
    for position, item_id in enumerate(ordered_item_ids):
        await session.execute(
            update(ListItem)
            .where(ListItem.id == item_id, ListItem.list_id == list_id)
            .values(position=position)
        )
    await session.flush()


async def membership_for_refs(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    refs: list[tuple[str, uuid.UUID]],
) -> set[tuple[str, uuid.UUID]]:
    """Return the subset of ``refs`` present on the list."""
    if not refs:
        return set()
    result = await session.execute(
        select(ListItem.content_type, ListItem.content_id).where(
            ListItem.list_id == list_id,
            tuple_(ListItem.content_type, ListItem.content_id).in_(refs),
        )
    )
    return {(row[0], row[1]) for row in result.all()}


async def custom_list_membership_for_content(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    content_type: str,
    content_id: uuid.UUID,
) -> tuple[dict[uuid.UUID, bool], dict[uuid.UUID, uuid.UUID]]:
    """Return membership and item ids for one content across custom lists."""
    lists_result = await session.execute(
        select(List.id).where(
            List.owner_user_id == owner_user_id,
            List.kind == 'custom',
        )
    )
    list_ids = list(lists_result.scalars().all())
    if not list_ids:
        return {}, {}

    present_result = await session.execute(
        select(ListItem.list_id, ListItem.id).where(
            ListItem.list_id.in_(list_ids),
            ListItem.content_type == content_type,
            ListItem.content_id == content_id,
        )
    )
    item_ids = {row[0]: row[1] for row in present_result.all()}
    membership = {list_id: list_id in item_ids for list_id in list_ids}
    return membership, item_ids
