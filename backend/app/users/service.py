"""Users domain service (profile shell, settings, public profiles)."""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.users import repository as users_repository
from app.users.models import User
from app.users.preferences import (
    PreferencesDict,
    merge_preference_patch,
    normalize_preferences,
)
from app.users.usernames import (
    is_reserved_username,
    is_valid_username,
    normalize_username,
    username_from_display_names,
    username_with_unique_suffix,
)

USERNAME_RENAME_COOLDOWN = timedelta(days=30)


class ProfileNotFoundError(Exception):
    """No Users profile for the identity."""


class UsernameConflictError(Exception):
    """Username already taken or reserved."""


class UsernameInvalidError(Exception):
    """Username fails format rules."""


class UsernameRenameCooldownError(Exception):
    """Username rename attempted before the cooldown elapsed."""

    def __init__(self, available_at: datetime) -> None:
        super().__init__('username rename cooldown active')
        self.available_at = available_at


@dataclass(frozen=True, slots=True)
class UserProfile:
    """Users-owned profile fields safe to expose to Auth/API layers."""

    id: uuid.UUID
    username: str | None
    display_name: str | None


@dataclass(frozen=True, slots=True)
class OwnedProfile:
    """Full own-profile view for settings APIs."""

    id: uuid.UUID
    username: str
    display_name: str | None
    bio: str | None
    avatar_url: str | None
    website_url: str | None
    links: list[dict[str, str]]
    preferences: PreferencesDict
    username_changed_at: datetime | None
    username_rename_available_at: datetime | None


@dataclass(frozen=True, slots=True)
class PublicProfile:
    """Public profile shell fields (counts assembled in the API layer)."""

    id: uuid.UUID
    identity_id: uuid.UUID
    username: str
    display_name: str | None
    bio: str | None
    avatar_url: str | None
    website_url: str | None
    links: list[dict[str, str]]


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


def _rename_available_at(changed_at: datetime | None) -> datetime | None:
    if changed_at is None:
        return None
    return changed_at + USERNAME_RENAME_COOLDOWN


def _links_as_dicts(raw: object) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    links: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        label = item.get('label')
        url = item.get('url')
        if isinstance(label, str) and isinstance(url, str):
            links.append({'label': label, 'url': url})
    return links


def _to_owned(user: User) -> OwnedProfile:
    username = user.username
    if not isinstance(username, str) or not username:
        raise ProfileNotFoundError('profile missing username')
    changed_at = user.username_changed_at
    return OwnedProfile(
        id=user.id,
        username=username,
        display_name=user.display_name,
        bio=user.bio,
        avatar_url=user.avatar_url,
        website_url=user.website_url,
        links=_links_as_dicts(user.links),
        preferences=normalize_preferences(user.preferences),
        username_changed_at=changed_at,
        username_rename_available_at=_rename_available_at(changed_at),
    )


async def allocate_unique_username(
    session: AsyncSession,
    *,
    base: str,
) -> str:
    """Return ``base`` or ``base`` + short unique suffix when taken/reserved."""
    normalized = normalize_username(base)
    if not is_valid_username(normalized):
        normalized = 'user'
    if not is_reserved_username(normalized):
        existing = await users_repository.get_user_by_username(session, normalized)
        if existing is None:
            return normalized
    for _ in range(32):
        suffix = secrets.token_hex(3)
        candidate = username_with_unique_suffix(normalized, suffix)
        if is_reserved_username(candidate):
            continue
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
    if is_reserved_username(normalized):
        raise ValueError('username unavailable')
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


async def get_owned_profile(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
) -> OwnedProfile:
    """Load the editable own-profile for ``identity_id``."""
    user = await users_repository.get_user_by_identity_id(session, identity_id)
    if user is None or user.username is None:
        raise ProfileNotFoundError('profile not found')
    return _to_owned(user)


async def get_public_profile(
    session: AsyncSession,
    *,
    username: str,
) -> PublicProfile:
    """Load a public profile by username (soft-deleted → not found)."""
    normalized = normalize_username(username)
    if not is_valid_username(normalized) or is_reserved_username(normalized):
        raise ProfileNotFoundError('profile not found')
    user = await users_repository.get_user_by_username(session, normalized)
    if user is None or user.username is None:
        raise ProfileNotFoundError('profile not found')
    return PublicProfile(
        id=user.id,
        identity_id=user.identity_id,
        username=user.username,
        display_name=user.display_name,
        bio=user.bio,
        avatar_url=user.avatar_url,
        website_url=user.website_url,
        links=_links_as_dicts(user.links),
    )


async def update_owned_profile(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    username: str | None = None,
    display_name: str | None | object = ...,
    bio: str | None | object = ...,
    avatar_url: str | None | object = ...,
    website_url: str | None | object = ...,
    links: list[dict[str, str]] | object = ...,
    theme: str | None = None,
    spoilers: str | None = None,
    language: str | None = None,
    update_preferences: bool = False,
) -> OwnedProfile:
    """Update own profile and optional preferences under a row lock."""
    user = await users_repository.get_user_by_identity_id(
        session,
        identity_id,
        for_update=True,
    )
    if user is None or user.username is None:
        raise ProfileNotFoundError('profile not found')

    next_username: str | None = None
    next_changed_at: datetime | object = ...
    if username is not None and username != user.username:
        normalized = normalize_username(username)
        if not is_valid_username(normalized):
            raise UsernameInvalidError('invalid username')
        if is_reserved_username(normalized):
            raise UsernameConflictError('username unavailable')
        available_at = _rename_available_at(user.username_changed_at)
        now = datetime.now(UTC)
        if available_at is not None and now < available_at:
            raise UsernameRenameCooldownError(available_at)
        taken = await users_repository.get_user_by_username(session, normalized)
        if taken is not None and taken.id != user.id:
            raise UsernameConflictError('username unavailable')
        next_username = normalized
        next_changed_at = now

    try:
        await users_repository.update_user_profile(
            session,
            user,
            username=next_username,
            display_name=display_name,
            bio=bio,
            avatar_url=avatar_url,
            website_url=website_url,
            links=links,
            username_changed_at=next_changed_at,
        )
        if update_preferences:
            current = normalize_preferences(user.preferences)
            merged = merge_preference_patch(
                current,
                theme=theme,
                spoilers=spoilers,
                language=language,
            )
            await users_repository.update_user_preferences(session, user, merged)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise UsernameConflictError('username unavailable') from exc

    refreshed = await users_repository.get_user_by_identity_id(session, identity_id)
    if refreshed is None or refreshed.username is None:
        raise ProfileNotFoundError('profile not found')
    return _to_owned(refreshed)


async def update_owned_preferences(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    theme: str | None = None,
    spoilers: str | None = None,
    language: str | None = None,
) -> OwnedProfile:
    """Merge preference patch onto the owner's stored preferences."""
    return await update_owned_profile(
        session,
        identity_id=identity_id,
        update_preferences=True,
        theme=theme,
        spoilers=spoilers,
        language=language,
    )
