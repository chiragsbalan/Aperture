"""Diary ORM: watch_entries (historical watch events, not list membership)."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Numeric,
    String,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.core.mixins import TimestampMixin, UuidPrimaryKeyMixin


class WatchEntry(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """One logged watch. Rewatches are additional rows for the same content."""

    __tablename__ = 'watch_entries'

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
    )
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    content_id: Mapped[uuid.UUID] = mapped_column(Uuid(), nullable=False)
    watched_at: Mapped[dt.date] = mapped_column(Date(), nullable=False)
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    rating: Mapped[Decimal | None] = mapped_column(
        Numeric(2, 1),
        nullable=True,
    )

    __table_args__ = (
        CheckConstraint(
            "content_type IN ('movie', 'tv_show')",
            name='content_type',
        ),
        CheckConstraint(
            'rating IS NULL OR (rating >= 0.5 AND rating <= 5.0 '
            'AND (rating * 2) = TRUNC(rating * 2))',
            name='rating_half_stars',
        ),
        Index(
            'ix_watch_entries_owner_watched_at',
            'owner_user_id',
            'watched_at',
            postgresql_ops={'watched_at': 'DESC'},
        ),
        Index(
            'ix_watch_entries_owner_content',
            'owner_user_id',
            'content_type',
            'content_id',
        ),
    )
