"""Lists ORM models: system lists (watchlist/favorites) and items."""

from __future__ import annotations

import uuid

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins import TimestampMixin, UuidPrimaryKeyMixin


class List(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Owned list row. System kinds are unique per owner via partial index."""

    __tablename__ = 'lists'

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    visibility: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default='private',
        server_default='private',
    )

    items: Mapped[list[ListItem]] = relationship(
        back_populates='list',
        cascade='all, delete-orphan',
        order_by='ListItem.position',
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('watchlist', 'favorites', 'custom')",
            name='kind',
        ),
        CheckConstraint(
            "visibility IN ('private', 'public', 'unlisted')",
            name='visibility',
        ),
        Index('ix_lists_owner_user_id', 'owner_user_id'),
        Index('ix_lists_owner_kind', 'owner_user_id', 'kind'),
        Index('ix_lists_visibility', 'visibility'),
        Index(
            'uq_lists_owner_system_kind',
            'owner_user_id',
            'kind',
            unique=True,
            postgresql_where=text("kind IN ('watchlist', 'favorites')"),
        ),
    )


class ListItem(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Ordered membership of a canonical title on a list."""

    __tablename__ = 'list_items'

    list_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey('lists.id', ondelete='CASCADE'),
        nullable=False,
    )
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    content_id: Mapped[uuid.UUID] = mapped_column(Uuid(), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    list: Mapped[List] = relationship(back_populates='items')

    __table_args__ = (
        CheckConstraint(
            "content_type IN ('movie', 'tv_show')",
            name='content_type',
        ),
        UniqueConstraint(
            'list_id',
            'content_type',
            'content_id',
            name='uq_list_items_list_content',
        ),
        Index('ix_list_items_list_id_position', 'list_id', 'position'),
    )
