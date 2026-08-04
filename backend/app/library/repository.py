"""Persistence helpers for watch_entries."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any, cast

from sqlalchemy import delete, func, select, tuple_
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.library.models import WatchEntry


async def insert_entry(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    content_type: str,
    content_id: uuid.UUID,
    watched_at: dt.date,
    note: str | None,
    rating: Decimal | None,
) -> WatchEntry:
    """Insert a diary row (rewatches allowed — no unique on content)."""
    entry = WatchEntry(
        owner_user_id=owner_user_id,
        content_type=content_type,
        content_id=content_id,
        watched_at=watched_at,
        note=note,
        rating=rating,
    )
    session.add(entry)
    await session.flush()
    return entry


async def get_entry_for_owner(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    entry_id: uuid.UUID,
) -> WatchEntry | None:
    """Return an entry owned by the user, if any."""
    result = await session.execute(
        select(WatchEntry).where(
            WatchEntry.id == entry_id,
            WatchEntry.owner_user_id == owner_user_id,
        )
    )
    return result.scalar_one_or_none()


async def count_entries(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    year: int | None = None,
    month: int | None = None,
) -> int:
    """Count diary rows, optionally filtered by year/month."""
    stmt = (
        select(func.count())
        .select_from(WatchEntry)
        .where(WatchEntry.owner_user_id == owner_user_id)
    )
    stmt = _apply_date_filters(stmt, year=year, month=month)
    result = await session.execute(stmt)
    return int(result.scalar_one())


async def count_distinct_titles_by_type(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    content_type: str,
) -> int:
    """Count distinct titles logged in the diary for one content type."""
    result = await session.execute(
        select(func.count(func.distinct(WatchEntry.content_id))).where(
            WatchEntry.owner_user_id == owner_user_id,
            WatchEntry.content_type == content_type,
        )
    )
    return int(result.scalar_one())


async def list_entries_page(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    offset: int,
    limit: int,
    year: int | None = None,
    month: int | None = None,
) -> list[WatchEntry]:
    """Return diary rows newest-first."""
    stmt = (
        select(WatchEntry)
        .where(WatchEntry.owner_user_id == owner_user_id)
        .order_by(
            WatchEntry.watched_at.desc(),
            WatchEntry.created_at.desc(),
        )
        .offset(offset)
        .limit(limit)
    )
    stmt = _apply_date_filters(stmt, year=year, month=month)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def delete_entry_for_owner(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    entry_id: uuid.UUID,
) -> bool:
    """Delete an owned entry. Returns True when a row was removed."""
    result = cast(
        CursorResult[Any],
        await session.execute(
            delete(WatchEntry).where(
                WatchEntry.id == entry_id,
                WatchEntry.owner_user_id == owner_user_id,
            )
        ),
    )
    return (result.rowcount or 0) > 0


async def content_refs_with_entries(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    refs: list[tuple[str, uuid.UUID]],
) -> set[tuple[str, uuid.UUID]]:
    """Return ``(content_type, content_id)`` pairs that have ≥1 diary row."""
    if not refs:
        return set()
    result = await session.execute(
        select(WatchEntry.content_type, WatchEntry.content_id)
        .where(
            WatchEntry.owner_user_id == owner_user_id,
            tuple_(WatchEntry.content_type, WatchEntry.content_id).in_(refs),
        )
        .distinct()
    )
    return {(row[0], row[1]) for row in result.all()}


def _apply_date_filters(stmt: Any, *, year: int | None, month: int | None) -> Any:
    if year is not None:
        stmt = stmt.where(func.extract('year', WatchEntry.watched_at) == year)
    if month is not None:
        stmt = stmt.where(func.extract('month', WatchEntry.watched_at) == month)
    return stmt
