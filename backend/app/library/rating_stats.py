"""Maintain community title rating aggregates from diary writes."""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import delete, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.library.models import WatchEntry
from app.metadata.cache_keys import movie_detail_key, tv_detail_key
from app.metadata.models import ContentRatingStats


async def recompute_for_title(
    session: AsyncSession,
    *,
    content_type: str,
    content_id: uuid.UUID,
) -> ContentRatingStats | None:
    """Recompute stats from latest non-null diary rating per user.

    Returns the stats row, or ``None`` when the title has zero ratings
    (and deletes any stale stats row).
    """
    latest = (
        select(
            WatchEntry.owner_user_id.label('owner_user_id'),
            WatchEntry.rating.label('rating'),
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
    agg = await session.execute(
        select(
            func.count().label('rating_count'),
            func.coalesce(func.sum(latest.c.rating), 0).label('rating_sum'),
        ).select_from(latest)
    )
    row = agg.one()
    count = int(row.rating_count or 0)
    rating_sum = Decimal(str(row.rating_sum or 0))

    if count == 0:
        await session.execute(
            delete(ContentRatingStats).where(
                ContentRatingStats.content_type == content_type,
                ContentRatingStats.content_id == content_id,
            )
        )
        return None

    now = text('now()')
    stmt = (
        pg_insert(ContentRatingStats)
        .values(
            content_type=content_type,
            content_id=content_id,
            rating_count=count,
            rating_sum=rating_sum,
            updated_at=now,
        )
        .on_conflict_do_update(
            index_elements=[
                ContentRatingStats.content_type,
                ContentRatingStats.content_id,
            ],
            set_={
                'rating_count': count,
                'rating_sum': rating_sum,
                'updated_at': now,
            },
        )
        .returning(ContentRatingStats)
    )
    result = await session.execute(stmt)
    return result.scalar_one()


async def invalidate_title_detail_cache(
    *,
    content_type: str,
    content_id: uuid.UUID,
) -> None:
    """Drop assembled detail DTO so hybrid rating re-resolves."""
    cache = get_cache()
    if content_type == 'movie':
        await cache.delete(movie_detail_key(content_id))
    elif content_type == 'tv_show':
        await cache.delete(tv_detail_key(content_id))
