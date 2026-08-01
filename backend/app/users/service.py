"""Users domain service (profile shell for P1.1 / Google seeding for P1.3)."""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.users import repository as users_repository
from app.users.usernames import (
    is_valid_username,
    normalize_username,
    username_from_display_names,
    username_with_unique_suffix,
)


@dataclass(frozen=True, slots=True)
class UserProfile:
    """Users-owned profile fields safe to expose to Auth/API layers."""

    id: uuid.UUID
    username: str | None
    display_name: str | None


def _display_name_from_parts(
    given_name: str | None,
    family_name: str | None,
) -> str | None:
    parts = [
        part.strip()
        for part in (given_name, family_name)
        if part is not None and part.strip()
    ]
    if not parts:
        return None
    return ' '.join(parts)[:120]


async def allocate_unique_username(
    session: AsyncSession,
    *,
    base: str,
) -> str:
    """Return ``base`` or ``base`` + short unique suffix when taken."""
    normalized = normalize_username(base)
    if not is_valid_username(normalized):
        normalized = 'user'
    existing = await users_repository.get_user_by_username(session, normalized)
    if existing is None:
        return normalized
    for _ in range(32):
        suffix = secrets.token_hex(3)
        candidate = username_with_unique_suffix(normalized, suffix)
        taken = await users_repository.get_user_by_username(session, candidate)
        if taken is None:
            return candidate
    raise RuntimeError('could not allocate unique username')


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


async def create_profile_for_google(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    given_name: str | None,
    family_name: str | None,
) -> UserProfile:
    """Create a profile seeded from Google given/family names."""
    base = username_from_display_names(given_name, family_name)
    username = await allocate_unique_username(session, base=base)
    display_name = _display_name_from_parts(given_name, family_name)
    user = await users_repository.create_user(
        session,
        identity_id=identity_id,
        username=username,
        display_name=display_name,
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
