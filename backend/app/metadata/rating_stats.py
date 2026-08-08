"""Read community title rating aggregates (written by the library domain)."""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.metadata.models import ContentRatingStats

logger = logging.getLogger(__name__)


async def get_stats(
    session: AsyncSession,
    *,
    content_type: str,
    content_id: uuid.UUID,
) -> ContentRatingStats | None:
    """Return stored aggregate for a title, if any.

    If ``content_rating_stats`` is missing (app ahead of migrate), treat as
    empty so title detail can still serve the TMDB rating fallback score.
    """
    try:
        result = await session.execute(
            select(ContentRatingStats).where(
                ContentRatingStats.content_type == content_type,
                ContentRatingStats.content_id == content_id,
            )
        )
    except ProgrammingError as exc:
        # asyncpg UndefinedTableError is wrapped by SQLAlchemy.
        msg = str(exc.orig) if exc.orig is not None else str(exc)
        if 'content_rating_stats' in msg and 'does not exist' in msg:
            logger.warning(
                'content_rating_stats missing; using TMDB rating fallback only'
            )
            await session.rollback()
            return None
        raise
    return result.scalar_one_or_none()


async def get_stats_for_content_ids(
    session: AsyncSession,
    *,
    content_ids: list[uuid.UUID],
) -> dict[uuid.UUID, ContentRatingStats]:
    """Batch-load rating stats keyed by ``content_id`` (any content_type)."""
    if not content_ids:
        return {}
    try:
        result = await session.execute(
            select(ContentRatingStats).where(
                ContentRatingStats.content_id.in_(content_ids),
            )
        )
    except ProgrammingError as exc:
        msg = str(exc.orig) if exc.orig is not None else str(exc)
        if 'content_rating_stats' in msg and 'does not exist' in msg:
            logger.warning(
                'content_rating_stats missing; search popularity uses TMDB only'
            )
            await session.rollback()
            return {}
        raise
    out: dict[uuid.UUID, ContentRatingStats] = {}
    for row in result.scalars().all():
        out[row.content_id] = row
    return out


def aperture_average(stats: ContentRatingStats) -> float | None:
    """Mean on the 0–5 scale, or None when empty."""
    if stats.rating_count <= 0:
        return None
    return float(Decimal(stats.rating_sum) / stats.rating_count)
