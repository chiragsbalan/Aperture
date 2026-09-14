"""Persistence helpers for watch_entries."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any, Literal, cast

from sqlalchemy import and_, delete, func, literal, select, tuple_, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.library.models import ReviewVote, WatchEntry
from app.metadata.models import ContentItem
from app.users.models import User

ReviewSort = Literal['popular', 'recent']
SpoilerFilter = Literal['all', 'no_spoilers']
RatingFilter = Literal['any', '5', '4_plus', '3_plus', 'below_3']
RatingSort = Literal['highest', 'lowest', 'recent']

_ELIGIBLE_NOTE = and_(
    WatchEntry.note.is_not(None),
    func.btrim(WatchEntry.note) != '',
    WatchEntry.rating.is_not(None),
)


async def insert_entry(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    content_type: str,
    content_id: uuid.UUID,
    watched_at: dt.date,
    note: str | None,
    rating: Decimal | None,
    contains_spoilers: bool = False,
) -> WatchEntry:
    """Insert a diary row (rewatches allowed — no unique on content)."""
    entry = WatchEntry(
        owner_user_id=owner_user_id,
        content_type=content_type,
        content_id=content_id,
        watched_at=watched_at,
        note=note,
        rating=rating,
        contains_spoilers=contains_spoilers,
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


async def latest_ratings_for_refs(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    refs: list[tuple[str, uuid.UUID]],
) -> dict[tuple[str, uuid.UUID], Decimal]:
    """Latest non-null diary rating per ``(content_type, content_id)``."""
    if not refs:
        return {}
    result = await session.execute(
        select(WatchEntry.content_type, WatchEntry.content_id, WatchEntry.rating)
        .where(
            WatchEntry.owner_user_id == owner_user_id,
            WatchEntry.rating.is_not(None),
            tuple_(WatchEntry.content_type, WatchEntry.content_id).in_(refs),
        )
        .distinct(WatchEntry.content_type, WatchEntry.content_id)
        .order_by(
            WatchEntry.content_type,
            WatchEntry.content_id,
            WatchEntry.watched_at.desc(),
            WatchEntry.created_at.desc(),
            WatchEntry.id.desc(),
        )
    )
    out: dict[tuple[str, uuid.UUID], Decimal] = {}
    for content_type, content_id, rating in result.all():
        if rating is None:
            continue
        out[(content_type, content_id)] = rating
    return out


def _apply_date_filters(stmt: Any, *, year: int | None, month: int | None) -> Any:
    if year is not None:
        stmt = stmt.where(func.extract('year', WatchEntry.watched_at) == year)
    if month is not None:
        stmt = stmt.where(func.extract('month', WatchEntry.watched_at) == month)
    return stmt


def _apply_rating_filter(stmt: Any, *, rating_filter: RatingFilter) -> Any:
    if rating_filter == '5':
        return stmt.where(WatchEntry.rating == Decimal('5.0'))
    if rating_filter == '4_plus':
        return stmt.where(WatchEntry.rating >= Decimal('4.0'))
    if rating_filter == '3_plus':
        return stmt.where(WatchEntry.rating >= Decimal('3.0'))
    if rating_filter == 'below_3':
        return stmt.where(WatchEntry.rating < Decimal('3.0'))
    return stmt


def _eligible_review_filters(*, spoiler_filter: SpoilerFilter) -> list[Any]:
    """Public review eligibility: text + rating + live author + catalog row."""
    filters: list[Any] = [
        _ELIGIBLE_NOTE,
        User.deleted_at.is_(None),
        User.username.is_not(None),
        ContentItem.id.is_not(None),
    ]
    if spoiler_filter == 'no_spoilers':
        filters.append(WatchEntry.contains_spoilers.is_(False))
    return filters


def _review_order(sort: ReviewSort) -> tuple[Any, ...]:
    score_expr = WatchEntry.like_count - WatchEntry.dislike_count
    if sort == 'recent':
        return (
            WatchEntry.watched_at.desc(),
            WatchEntry.created_at.desc(),
            WatchEntry.id.desc(),
        )
    return (
        score_expr.desc(),
        WatchEntry.watched_at.desc(),
        WatchEntry.id.desc(),
    )


def _reviews_base_select(*, viewer_user_id: uuid.UUID | None) -> Any:
    if viewer_user_id is None:
        return (
            select(WatchEntry, User, literal(None))
            .join(User, User.id == WatchEntry.owner_user_id)
            .join(
                ContentItem,
                and_(
                    ContentItem.id == WatchEntry.content_id,
                    ContentItem.content_type == WatchEntry.content_type,
                ),
            )
        )
    return (
        select(WatchEntry, User, ReviewVote.vote)
        .join(User, User.id == WatchEntry.owner_user_id)
        .join(
            ContentItem,
            and_(
                ContentItem.id == WatchEntry.content_id,
                ContentItem.content_type == WatchEntry.content_type,
            ),
        )
        .outerjoin(
            ReviewVote,
            and_(
                ReviewVote.watch_entry_id == WatchEntry.id,
                ReviewVote.voter_user_id == viewer_user_id,
            ),
        )
    )


async def count_title_reviews(
    session: AsyncSession,
    *,
    content_type: str,
    content_id: uuid.UUID,
    spoiler_filter: SpoilerFilter,
    rating_filter: RatingFilter,
) -> int:
    """Count eligible public reviews for a title."""
    stmt = (
        select(func.count())
        .select_from(WatchEntry)
        .join(User, User.id == WatchEntry.owner_user_id)
        .join(
            ContentItem,
            and_(
                ContentItem.id == WatchEntry.content_id,
                ContentItem.content_type == WatchEntry.content_type,
            ),
        )
        .where(
            WatchEntry.content_type == content_type,
            WatchEntry.content_id == content_id,
            *_eligible_review_filters(spoiler_filter=spoiler_filter),
        )
    )
    stmt = _apply_rating_filter(stmt, rating_filter=rating_filter)
    result = await session.execute(stmt)
    return int(result.scalar_one())


async def list_title_reviews_page(
    session: AsyncSession,
    *,
    content_type: str,
    content_id: uuid.UUID,
    sort: ReviewSort,
    spoiler_filter: SpoilerFilter,
    rating_filter: RatingFilter,
    offset: int,
    limit: int,
    viewer_user_id: uuid.UUID | None,
) -> list[tuple[WatchEntry, User, int | None]]:
    """Return eligible title reviews with author and optional viewer vote."""
    stmt = _reviews_base_select(viewer_user_id=viewer_user_id).where(
        WatchEntry.content_type == content_type,
        WatchEntry.content_id == content_id,
        *_eligible_review_filters(spoiler_filter=spoiler_filter),
    )
    stmt = _apply_rating_filter(stmt, rating_filter=rating_filter)
    stmt = stmt.order_by(*_review_order(sort)).offset(offset).limit(limit)
    result = await session.execute(stmt)
    rows: list[tuple[WatchEntry, User, int | None]] = []
    for entry, author, vote in result.all():
        rows.append((entry, author, int(vote) if vote is not None else None))
    return rows


async def count_owner_reviews(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    spoiler_filter: SpoilerFilter,
    rating_filter: RatingFilter,
) -> int:
    """Count an owner's qualifying public reviews."""
    stmt = (
        select(func.count())
        .select_from(WatchEntry)
        .join(User, User.id == WatchEntry.owner_user_id)
        .join(
            ContentItem,
            and_(
                ContentItem.id == WatchEntry.content_id,
                ContentItem.content_type == WatchEntry.content_type,
            ),
        )
        .where(
            WatchEntry.owner_user_id == owner_user_id,
            *_eligible_review_filters(spoiler_filter=spoiler_filter),
        )
    )
    stmt = _apply_rating_filter(stmt, rating_filter=rating_filter)
    result = await session.execute(stmt)
    return int(result.scalar_one())


async def list_owner_reviews_page(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    sort: ReviewSort,
    spoiler_filter: SpoilerFilter,
    rating_filter: RatingFilter,
    offset: int,
    limit: int,
    viewer_user_id: uuid.UUID | None,
) -> list[tuple[WatchEntry, User, int | None]]:
    """Return an owner's qualifying reviews newest-first unless popular."""
    stmt = _reviews_base_select(viewer_user_id=viewer_user_id).where(
        WatchEntry.owner_user_id == owner_user_id,
        *_eligible_review_filters(spoiler_filter=spoiler_filter),
    )
    stmt = _apply_rating_filter(stmt, rating_filter=rating_filter)
    stmt = stmt.order_by(*_review_order(sort)).offset(offset).limit(limit)
    result = await session.execute(stmt)
    rows: list[tuple[WatchEntry, User, int | None]] = []
    for entry, author, vote in result.all():
        rows.append((entry, author, int(vote) if vote is not None else None))
    return rows


async def get_eligible_review(
    session: AsyncSession,
    *,
    entry_id: uuid.UUID,
    content_type: str,
    content_id: uuid.UUID,
    viewer_user_id: uuid.UUID | None,
) -> tuple[WatchEntry, User, int | None] | None:
    """Return one qualifying review for a title, or None."""
    stmt = _reviews_base_select(viewer_user_id=viewer_user_id).where(
        WatchEntry.id == entry_id,
        WatchEntry.content_type == content_type,
        WatchEntry.content_id == content_id,
        *_eligible_review_filters(spoiler_filter='all'),
    )
    result = await session.execute(stmt)
    row = result.one_or_none()
    if row is None:
        return None
    entry, author, vote = row
    return (entry, author, int(vote) if vote is not None else None)


def _latest_title_ratings_subquery(*, content_type: str, content_id: uuid.UUID) -> Any:
    """Latest non-null diary rating per user for one title (ADR-0015)."""
    return (
        select(
            WatchEntry.owner_user_id.label('owner_user_id'),
            WatchEntry.rating.label('rating'),
            WatchEntry.watched_at.label('watched_at'),
            WatchEntry.created_at.label('created_at'),
            WatchEntry.id.label('entry_id'),
        )
        .where(
            WatchEntry.content_type == content_type,
            WatchEntry.content_id == content_id,
            WatchEntry.rating.is_not(None),
        )
        .distinct(WatchEntry.owner_user_id)
        .order_by(
            WatchEntry.owner_user_id,
            WatchEntry.watched_at.desc(),
            WatchEntry.created_at.desc(),
            WatchEntry.id.desc(),
        )
        .subquery()
    )


def _rating_people_order(sort: RatingSort, latest: Any) -> tuple[Any, ...]:
    if sort == 'highest':
        return (
            latest.c.rating.desc(),
            latest.c.watched_at.desc(),
            latest.c.entry_id.desc(),
        )
    if sort == 'lowest':
        return (
            latest.c.rating.asc(),
            latest.c.watched_at.asc(),
            latest.c.entry_id.desc(),
        )
    return (
        latest.c.watched_at.desc(),
        latest.c.created_at.desc(),
        latest.c.entry_id.desc(),
    )


async def count_title_ratings(
    session: AsyncSession,
    *,
    content_type: str,
    content_id: uuid.UUID,
) -> int:
    """Count live users with a diary rating on this title."""
    latest = _latest_title_ratings_subquery(
        content_type=content_type,
        content_id=content_id,
    )
    stmt = (
        select(func.count())
        .select_from(latest)
        .join(User, User.id == latest.c.owner_user_id)
        .where(
            User.deleted_at.is_(None),
            User.username.is_not(None),
        )
    )
    result = await session.execute(stmt)
    return int(result.scalar_one())


async def list_title_ratings_page(
    session: AsyncSession,
    *,
    content_type: str,
    content_id: uuid.UUID,
    sort: RatingSort,
    offset: int,
    limit: int,
) -> list[tuple[User, Decimal, dt.date]]:
    """Return latest-per-user ratings with live authors."""
    latest = _latest_title_ratings_subquery(
        content_type=content_type,
        content_id=content_id,
    )
    stmt = (
        select(User, latest.c.rating, latest.c.watched_at)
        .join(User, User.id == latest.c.owner_user_id)
        .where(
            User.deleted_at.is_(None),
            User.username.is_not(None),
        )
        .order_by(*_rating_people_order(sort, latest))
        .offset(offset)
        .limit(limit)
    )
    result = await session.execute(stmt)
    rows: list[tuple[User, Decimal, dt.date]] = []
    for author, rating, watched_at in result.all():
        if rating is None:
            continue
        rows.append((author, rating, watched_at))
    return rows


async def get_eligible_review_for_update(
    session: AsyncSession,
    *,
    entry_id: uuid.UUID,
) -> WatchEntry | None:
    """Lock a qualifying public review row, or None if it is not votable."""
    stmt = (
        select(WatchEntry)
        .join(User, User.id == WatchEntry.owner_user_id)
        .join(
            ContentItem,
            and_(
                ContentItem.id == WatchEntry.content_id,
                ContentItem.content_type == WatchEntry.content_type,
            ),
        )
        .where(
            WatchEntry.id == entry_id,
            *_eligible_review_filters(spoiler_filter='all'),
        )
        .with_for_update()
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_vote_for_update(
    session: AsyncSession,
    *,
    watch_entry_id: uuid.UUID,
    voter_user_id: uuid.UUID,
) -> ReviewVote | None:
    """Lock the caller's vote row for this review, if any."""
    result = await session.execute(
        select(ReviewVote)
        .where(
            ReviewVote.watch_entry_id == watch_entry_id,
            ReviewVote.voter_user_id == voter_user_id,
        )
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def insert_vote(
    session: AsyncSession,
    *,
    watch_entry_id: uuid.UUID,
    voter_user_id: uuid.UUID,
    vote: int,
) -> ReviewVote:
    """Insert a like or dislike."""
    row = ReviewVote(
        watch_entry_id=watch_entry_id,
        voter_user_id=voter_user_id,
        vote=vote,
    )
    session.add(row)
    await session.flush()
    return row


async def delete_vote(
    session: AsyncSession,
    *,
    vote: ReviewVote,
) -> None:
    """Remove a vote row."""
    await session.delete(vote)
    await session.flush()


async def apply_vote_count_delta(
    session: AsyncSession,
    *,
    entry_id: uuid.UUID,
    like_delta: int = 0,
    dislike_delta: int = 0,
) -> None:
    """Adjust denormalized like/dislike counters in the same transaction."""
    if like_delta == 0 and dislike_delta == 0:
        return
    values: dict[str, Any] = {}
    if like_delta != 0:
        values['like_count'] = WatchEntry.like_count + like_delta
    if dislike_delta != 0:
        values['dislike_count'] = WatchEntry.dislike_count + dislike_delta
    await session.execute(
        update(WatchEntry).where(WatchEntry.id == entry_id).values(**values)
    )
