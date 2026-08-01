"""Persistence for Users domain."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import User


async def create_user(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    username: str | None = None,
) -> User:
    """Insert a profile shell row for ``identity_id``."""
    user = User(identity_id=identity_id, username=username)
    session.add(user)
    await session.flush()
    return user


async def get_user_by_identity_id(
    session: AsyncSession,
    identity_id: uuid.UUID,
) -> User | None:
    """Return the user profile for an identity, if any."""
    result = await session.execute(
        select(User).where(
            User.identity_id == identity_id,
            User.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_user_by_username(
    session: AsyncSession,
    username: str,
) -> User | None:
    """Return a non-deleted user with the given normalized username."""
    result = await session.execute(
        select(User).where(
            User.username == username,
            User.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()
