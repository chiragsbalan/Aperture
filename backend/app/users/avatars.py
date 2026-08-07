"""Avatar upload orchestration on Cloudflare R2 (Users domain)."""

from __future__ import annotations

import uuid
from contextlib import suppress
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import r2 as r2_store
from app.core.config import Settings
from app.users import repository as users_repository
from app.users.service import OwnedProfile, ProfileNotFoundError, get_owned_profile

ALLOWED_AVATAR_CONTENT_TYPES: frozenset[str] = frozenset(
    {
        'image/jpeg',
        'image/png',
        'image/webp',
    }
)

_EXT_BY_TYPE: dict[str, str] = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
}


class AvatarStorageUnavailableError(Exception):
    """R2 is not configured in this environment."""


class AvatarValidationError(Exception):
    """Client input failed avatar rules (type/size/key)."""


class AvatarObjectMissingError(Exception):
    """Expected R2 object is missing at confirm time."""


@dataclass(frozen=True, slots=True)
class AvatarUploadSlot:
    """Presigned upload grant for the browser."""

    upload_url: str
    public_url: str
    key: str
    expires_in: int
    max_bytes: int
    content_type: str


def _require_r2(settings: Settings) -> None:
    if not r2_store.r2_configured(settings):
        raise AvatarStorageUnavailableError('avatar storage is not configured')


def _assert_content_type(content_type: str) -> str:
    cleaned = content_type.strip().lower()
    if cleaned not in ALLOWED_AVATAR_CONTENT_TYPES:
        raise AvatarValidationError(
            'content_type must be image/jpeg, image/png, or image/webp'
        )
    return cleaned


def _assert_byte_size(settings: Settings, byte_size: int) -> None:
    if byte_size < 1:
        raise AvatarValidationError('byte_size must be at least 1')
    if byte_size > settings.avatar_max_bytes:
        raise AvatarValidationError(
            f'byte_size must be at most {settings.avatar_max_bytes}'
        )


def build_avatar_key(*, user_id: uuid.UUID, content_type: str) -> str:
    """Content-addressed-ish key: new UUID per upload for cache busting."""
    ext = _EXT_BY_TYPE[content_type]
    return f'avatars/{user_id}/{uuid.uuid4()}.{ext}'


def create_upload_slot(
    settings: Settings,
    *,
    user_id: uuid.UUID,
    content_type: str,
    byte_size: int,
) -> AvatarUploadSlot:
    """Validate request and mint a short-lived presigned PUT URL."""
    _require_r2(settings)
    ctype = _assert_content_type(content_type)
    _assert_byte_size(settings, byte_size)
    key = build_avatar_key(user_id=user_id, content_type=ctype)
    expires_in = settings.r2_upload_url_ttl_seconds
    upload_url = r2_store.generate_presigned_put_url(
        settings,
        key=key,
        content_type=ctype,
        expires_in=expires_in,
    )
    return AvatarUploadSlot(
        upload_url=upload_url,
        public_url=r2_store.public_object_url(settings, key),
        key=key,
        expires_in=expires_in,
        max_bytes=settings.avatar_max_bytes,
        content_type=ctype,
    )


def _assert_key_owned_by_user(key: str, user_id: uuid.UUID) -> None:
    prefix = f'avatars/{user_id}/'
    if not key.startswith(prefix) or key.count('/') != 2:
        raise AvatarValidationError('invalid avatar key')
    rest = key[len(prefix) :]
    if not rest or '/' in rest or rest.startswith('.'):
        raise AvatarValidationError('invalid avatar key')


async def confirm_avatar_upload(
    session: AsyncSession,
    settings: Settings,
    *,
    identity_id: uuid.UUID,
    key: str,
) -> OwnedProfile:
    """Verify the object exists in R2 and set ``users.avatar_url``."""
    _require_r2(settings)
    user = await users_repository.get_user_by_identity_id(
        session,
        identity_id,
        for_update=True,
    )
    if user is None or user.username is None:
        raise ProfileNotFoundError('profile not found')

    _assert_key_owned_by_user(key, user.id)

    try:
        head = await r2_store.head_object(settings, key)
    except r2_store.R2ObjectError as exc:
        raise AvatarObjectMissingError('uploaded object not found') from exc

    ctype = (head.content_type or '').split(';')[0].strip().lower()
    if ctype not in ALLOWED_AVATAR_CONTENT_TYPES:
        with suppress(Exception):
            await r2_store.delete_object(settings, key)
        raise AvatarValidationError('uploaded object has invalid content type')

    length = head.content_length or 0
    if length < 1 or length > settings.avatar_max_bytes:
        with suppress(Exception):
            await r2_store.delete_object(settings, key)
        raise AvatarValidationError('uploaded object exceeds size limit')

    public_url = r2_store.public_object_url(settings, key)
    previous = user.avatar_url
    await users_repository.update_user_profile(
        session,
        user,
        avatar_url=public_url,
    )
    await session.commit()

    if previous and previous != public_url:
        old_key = r2_store.key_from_public_url(settings, previous)
        if old_key is not None:
            with suppress(Exception):
                await r2_store.delete_object(settings, old_key)

    return await get_owned_profile(session, identity_id=identity_id)


async def delete_avatar(
    session: AsyncSession,
    settings: Settings,
    *,
    identity_id: uuid.UUID,
) -> OwnedProfile:
    """Clear ``avatar_url`` and delete the R2 object when it is ours."""
    user = await users_repository.get_user_by_identity_id(
        session,
        identity_id,
        for_update=True,
    )
    if user is None or user.username is None:
        raise ProfileNotFoundError('profile not found')

    previous = user.avatar_url
    await users_repository.update_user_profile(
        session,
        user,
        avatar_url=None,
    )
    await session.commit()

    if previous and r2_store.r2_configured(settings):
        old_key = r2_store.key_from_public_url(settings, previous)
        if old_key is not None:
            with suppress(Exception):
                await r2_store.delete_object(settings, old_key)

    return await get_owned_profile(session, identity_id=identity_id)
