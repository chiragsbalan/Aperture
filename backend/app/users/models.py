"""Users ORM models: profile shell created at registration."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.core.mixins import SoftDeleteMixin, TimestampMixin, UuidPrimaryKeyMixin
from app.users.preferences import DEFAULT_PREFERENCES


class User(UuidPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Profile owned by Users module; linked 1:1 to an Auth identity."""

    __tablename__ = 'users'

    identity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('identities.id', ondelete='CASCADE'),
        nullable=False,
    )
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    links: Mapped[list[Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    preferences: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: dict(DEFAULT_PREFERENCES),
    )
    username_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        UniqueConstraint('identity_id', name='uq_users_identity_id'),
        UniqueConstraint('username', name='uq_users_username'),
    )
