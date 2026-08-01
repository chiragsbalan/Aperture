"""Users domain service (profile shell for P1.1)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.users import repository as users_repository
from app.users.usernames import is_valid_username, normalize_username


@dataclass(frozen=True, slots=True)
class UserProfile:
    """Users-owned profile fields safe to expose to Auth/API layers."""

    id: uuid.UUID
    username: str | None
    display_name: str | None


async def create_profile_for_identity(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    username: str,
) -> UserProfile:
    """Create the Users-owned profile row during registration."""
    normalized = normalize_username(username)
    if not is_valid_username(normalized):
        raise ValueError('invalid username')
    user = await users_repository.create_user(
        session,
        identity_id=identity_id,
        username=normalized,
    )
    return UserProfile(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
    )


async def get_profile_for_identity(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
) -> UserProfile | None:
    """Load the profile linked to ``identity_id``."""
    user = await users_repository.get_user_by_identity_id(session, identity_id)
    if user is None:
        return None
    return UserProfile(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
    )


async def get_identity_id_by_username(
    session: AsyncSession,
    *,
    username: str,
) -> uuid.UUID | None:
    """Resolve an identity id from a normalized username, if any."""
    normalized = normalize_username(username)
    if not is_valid_username(normalized):
        return None
    user = await users_repository.get_user_by_username(session, normalized)
    if user is None:
        return None
    return user.identity_id
