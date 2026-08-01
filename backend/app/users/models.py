"""Users ORM models: profile shell created at registration."""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base
from app.core.mixins import SoftDeleteMixin, TimestampMixin, UuidPrimaryKeyMixin


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

    __table_args__ = (
        UniqueConstraint('identity_id', name='uq_users_identity_id'),
        UniqueConstraint('username', name='uq_users_username'),
    )
