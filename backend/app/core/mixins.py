"""Reusable column mixins for ORM models.

Compose mixins per entity. Soft-delete is opt-in: only models that need
recoverable deletes should include ``SoftDeleteMixin``.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import new_uuid7


class UuidPrimaryKeyMixin:
    """UUIDv7 primary key generated in the application."""

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        default=new_uuid7,
    )


class TimestampMixin:
    """``created_at`` / ``updated_at`` timestamps (UTC, timezone-aware)."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    """Optional soft-delete column. Omit on hard-delete-only entities."""

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
