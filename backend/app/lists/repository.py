"""Persistence helpers for lists and list items."""

from __future__ import annotations

import uuid
from typing import Any, cast

from sqlalchemy import delete, func, select
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


async def lock_list(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
) -> List | None:
    """Lock a list row for capacity/position updates."""
    result = await session.execute(
        select(List).where(List.id == list_id).with_for_update()
    )
    return result.scalar_one_or_none()


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


async def membership_for_refs(
    session: AsyncSession,
    *,
    list_id: uuid.UUID,
    refs: list[tuple[str, uuid.UUID]],
) -> set[tuple[str, uuid.UUID]]:
    """Return the subset of ``refs`` present on the list."""
    if not refs:
        return set()
    # Match on (content_type, content_id) pairs.
    content_ids = [content_id for _, content_id in refs]
    result = await session.execute(
        select(ListItem.content_type, ListItem.content_id).where(
            ListItem.list_id == list_id,
            ListItem.content_id.in_(content_ids),
        )
    )
    present = {(row[0], row[1]) for row in result.all()}
    wanted = set(refs)
    return present & wanted
