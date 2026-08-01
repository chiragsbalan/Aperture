"""Persistence for Users domain."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import User
from app.users.preferences import DEFAULT_PREFERENCES


async def create_user(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    username: str | None = None,
    display_name: str | None = None,
) -> User:
    """Insert a profile shell row for ``identity_id``."""
    user = User(
        identity_id=identity_id,
        username=username,
        display_name=display_name,
        preferences=dict(DEFAULT_PREFERENCES),
    )
    session.add(user)
    await session.flush()
    return user


async def get_user_by_identity_id(
    session: AsyncSession,
    identity_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> User | None:
    """Return the user profile for an identity, if any."""
    stmt = select(User).where(
        User.identity_id == identity_id,
        User.deleted_at.is_(None),
    )
    if for_update:
        stmt = stmt.with_for_update()
    result = await session.execute(stmt)
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


async def update_user_profile(
    session: AsyncSession,
    user: User,
    *,
    username: str | None = None,
    display_name: str | None | object = ...,
    bio: str | None | object = ...,
    username_changed_at: datetime | None | object = ...,
) -> User:
    """Mutate profile fields on ``user`` and flush."""
    if username is not None:
        user.username = username
    if display_name is not ...:
        user.display_name = display_name  # type: ignore[assignment]
    if bio is not ...:
        user.bio = bio  # type: ignore[assignment]
    if username_changed_at is not ...:
        user.username_changed_at = username_changed_at  # type: ignore[assignment]
    await session.flush()
    return user


async def update_user_preferences(
    session: AsyncSession,
    user: User,
    preferences: dict[str, Any],
) -> User:
    """Replace the preferences JSON document and flush."""
    user.preferences = preferences
    await session.flush()
    return user
