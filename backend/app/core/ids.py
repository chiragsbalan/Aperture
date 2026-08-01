"""Identifier helpers (UUIDv7)."""

from __future__ import annotations

import uuid

import uuid_utils


def new_uuid7(_ctx: object | None = None) -> uuid.UUID:
    """Return a new UUIDv7 as a stdlib ``uuid.UUID``.

    Accepts an optional SQLAlchemy default-generation context when used as a
    ``mapped_column(default=...)`` callable.
    """
    return uuid.UUID(bytes=uuid_utils.uuid7().bytes)
