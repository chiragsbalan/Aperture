"""Unit tests for avatar R2 orchestration (mocked storage)."""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from app.core.config import Settings
from app.core.r2 import (
    R2ObjectHead,
    is_our_public_avatar_url,
    key_from_public_url,
    public_object_url,
)
from app.users import avatars as avatars_service


def _settings(**overrides: Any) -> Settings:
    base = {
        'database_url': 'postgresql+asyncpg://u:p@localhost:5432/t',
        'jwt_secret': 'unit-test-secret-at-least-32-bytes-long',
        'r2_account_id': 'acct',
        'r2_access_key_id': 'key',
        'r2_secret_access_key': 'secret',
        'r2_bucket': 'aperture-avatars',
        'r2_public_base_url': 'https://media.example.com',
        'r2_upload_url_ttl_seconds': 120,
        'avatar_max_bytes': 2 * 1024 * 1024,
    }
    base.update(overrides)
    return Settings(**base)


def test_public_url_and_key_roundtrip() -> None:
    settings = _settings()
    key = f'avatars/{uuid.uuid4()}/{uuid.uuid4()}.webp'
    url = public_object_url(settings, key)
    assert url == f'https://media.example.com/{key}'
    assert key_from_public_url(settings, url) == key
    assert key_from_public_url(settings, 'https://evil.example/x') is None
    assert is_our_public_avatar_url(settings, url)
    assert not is_our_public_avatar_url(
        settings,
        'https://media.example.com/other/path.webp',
    )


def test_create_upload_slot_validates_type_and_size() -> None:
    settings = _settings()
    user_id = uuid.uuid4()
    with patch(
        'app.users.avatars.r2_store.generate_presigned_put_url',
        return_value='https://acct.r2.cloudflarestorage.com/put',
    ) as mock_presign:
        slot = avatars_service.create_upload_slot(
            settings,
            user_id=user_id,
            content_type='image/webp',
            byte_size=1024,
        )
    assert slot.content_type == 'image/webp'
    assert slot.key.startswith(f'avatars/{user_id}/')
    assert slot.key.endswith('.webp')
    assert slot.public_url.startswith('https://media.example.com/')
    assert slot.cache_control == 'public, max-age=31536000, immutable'
    mock_presign.assert_called_once()
    assert mock_presign.call_args.kwargs['content_length'] == 1024

    with pytest.raises(avatars_service.AvatarValidationError):
        avatars_service.create_upload_slot(
            settings,
            user_id=user_id,
            content_type='image/gif',
            byte_size=100,
        )

    with pytest.raises(avatars_service.AvatarValidationError):
        avatars_service.create_upload_slot(
            settings,
            user_id=user_id,
            content_type='image/png',
            byte_size=settings.avatar_max_bytes + 1,
        )


def test_create_upload_slot_requires_r2() -> None:
    settings = _settings(r2_account_id='')
    with pytest.raises(avatars_service.AvatarStorageUnavailableError):
        avatars_service.create_upload_slot(
            settings,
            user_id=uuid.uuid4(),
            content_type='image/png',
            byte_size=100,
        )


def test_sniff_image_content_type() -> None:
    assert avatars_service.sniff_image_content_type(b'\xff\xd8\xff\xe0') == 'image/jpeg'
    assert (
        avatars_service.sniff_image_content_type(b'\x89PNG\r\n\x1a\nxxxx')
        == 'image/png'
    )
    assert (
        avatars_service.sniff_image_content_type(b'RIFF\x00\x00\x00\x00WEBP....')
        == 'image/webp'
    )
    assert avatars_service.sniff_image_content_type(b'GIF89a') is None


def test_assert_key_owned_by_user() -> None:
    user_id = uuid.uuid4()
    key = f'avatars/{user_id}/{uuid.uuid4()}.webp'
    avatars_service._assert_key_owned_by_user(key, user_id)
    with pytest.raises(avatars_service.AvatarValidationError):
        avatars_service._assert_key_owned_by_user(
            f'avatars/{uuid.uuid4()}/{uuid.uuid4()}.webp',
            user_id,
        )
    with pytest.raises(avatars_service.AvatarValidationError):
        avatars_service._assert_key_owned_by_user('avatars/../escape', user_id)
    with pytest.raises(avatars_service.AvatarValidationError):
        avatars_service._assert_key_owned_by_user(
            f'avatars/{user_id}/not-a-uuid.webp',
            user_id,
        )


@pytest.mark.asyncio
async def test_confirm_avatar_happy_path() -> None:
    settings = _settings()
    identity_id = uuid.uuid4()
    user_id = uuid.uuid4()
    key = f'avatars/{user_id}/{uuid.uuid4()}.webp'

    user = MagicMock()
    user.id = user_id
    user.username = 'ada'
    user.avatar_url = None
    user.display_name = 'Ada'
    user.bio = None
    user.website_url = None
    user.links = []
    user.preferences = {'theme': 'system', 'spoilers': 'show', 'language': 'en'}
    user.username_changed_at = None

    session = MagicMock()

    async def _get_user(*_a: Any, **_k: Any) -> MagicMock:
        return user

    async def _update(*_a: Any, **_k: Any) -> MagicMock:
        user.avatar_url = public_object_url(settings, key)
        return user

    async def _commit() -> None:
        return None

    session.commit = _commit  # type: ignore[method-assign]

    with (
        patch(
            'app.users.avatars.users_repository.get_user_by_identity_id',
            side_effect=_get_user,
        ),
        patch(
            'app.users.avatars.users_repository.update_user_profile',
            side_effect=_update,
        ),
        patch(
            'app.users.avatars.r2_store.head_object',
            return_value=R2ObjectHead(
                content_type='image/webp',
                content_length=2048,
            ),
        ),
        patch(
            'app.users.avatars.r2_store.get_object_prefix',
            return_value=b'RIFF\x00\x00\x00\x00WEBP....',
        ),
        patch(
            'app.users.avatars.get_owned_profile',
        ) as mock_owned,
    ):
        from app.users.service import OwnedProfile

        mock_owned.return_value = OwnedProfile(
            id=user_id,
            username='ada',
            display_name='Ada',
            bio=None,
            avatar_url=public_object_url(settings, key),
            website_url=None,
            links=[],
            preferences={'theme': 'system', 'spoilers': 'show', 'language': 'en'},
            username_changed_at=None,
            username_rename_available_at=None,
        )

        profile = await avatars_service.confirm_avatar_upload(
            session,
            settings,
            identity_id=identity_id,
            key=key,
        )

    assert profile.avatar_url == public_object_url(settings, key)


@pytest.mark.asyncio
async def test_confirm_rejects_foreign_key() -> None:
    settings = _settings()
    identity_id = uuid.uuid4()
    user_id = uuid.uuid4()
    foreign_key = f'avatars/{uuid.uuid4()}/{uuid.uuid4()}.webp'

    user = MagicMock()
    user.id = user_id
    user.username = 'ada'

    async def _get_user(*_a: Any, **_k: Any) -> MagicMock:
        return user

    session = MagicMock()
    with patch(
        'app.users.avatars.users_repository.get_user_by_identity_id',
        side_effect=_get_user,
    ):
        with pytest.raises(avatars_service.AvatarValidationError):
            await avatars_service.confirm_avatar_upload(
                session,
                settings,
                identity_id=identity_id,
                key=foreign_key,
            )


def test_is_allowed_google_picture_url() -> None:
    assert avatars_service.is_allowed_google_picture_url(
        'https://lh3.googleusercontent.com/a/ABC123=s96-c',
    )
    assert avatars_service.is_allowed_google_picture_url(
        'https://lh3.googleusercontent.com/a-/path',
    )
    assert not avatars_service.is_allowed_google_picture_url(
        'http://lh3.googleusercontent.com/a/x',
    )
    assert not avatars_service.is_allowed_google_picture_url(
        'https://evil.com/a/x',
    )
    assert not avatars_service.is_allowed_google_picture_url(
        'https://googleusercontent.com.evil.com/a/x',
    )
    assert not avatars_service.is_allowed_google_picture_url(
        'https://notgoogleusercontent.com/a/x',
    )
    assert not avatars_service.is_allowed_google_picture_url(
        'https://lh3.googleusercontent.com/',
    )
    assert not avatars_service.is_allowed_google_picture_url('')


@pytest.mark.asyncio
async def test_ingest_google_picture_happy_path() -> None:
    settings = _settings()
    identity_id = uuid.uuid4()
    user_id = uuid.uuid4()
    jpeg = b'\xff\xd8\xff\xe0' + b'\x00' * 64
    picture = 'https://lh3.googleusercontent.com/a/photo=s96-c'

    user = MagicMock()
    user.id = user_id
    user.username = 'ada'
    user.avatar_url = None

    async def _get_user(*_a: Any, **_k: Any) -> MagicMock:
        return user

    async def _update(*_a: Any, **kwargs: Any) -> MagicMock:
        if 'avatar_url' in kwargs:
            user.avatar_url = kwargs['avatar_url']
        return user

    session = MagicMock()

    async def _commit() -> None:
        return None

    session.commit = _commit  # type: ignore[method-assign]

    with (
        patch(
            'app.users.avatars.users_repository.get_user_by_identity_id',
            side_effect=_get_user,
        ),
        patch(
            'app.users.avatars.users_repository.update_user_profile',
            side_effect=_update,
        ),
        patch(
            'app.users.avatars._fetch_google_picture_bytes',
            return_value=jpeg,
        ) as fetch_mock,
        patch(
            'app.users.avatars.r2_store.put_object',
            return_value=None,
        ) as put_mock,
    ):
        ok = await avatars_service.ingest_google_picture_if_empty(
            session,
            settings,
            identity_id=identity_id,
            picture_url=picture,
        )

    assert ok is True
    assert user.avatar_url is not None
    assert user.avatar_url.startswith('https://media.example.com/avatars/')
    fetch_mock.assert_awaited_once()
    put_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_ingest_google_picture_skips_when_avatar_set() -> None:
    settings = _settings()
    identity_id = uuid.uuid4()
    user = MagicMock()
    user.id = uuid.uuid4()
    user.username = 'ada'
    user.avatar_url = 'https://media.example.com/avatars/x/y.webp'

    async def _get_user(*_a: Any, **_k: Any) -> MagicMock:
        return user

    session = MagicMock()
    with (
        patch(
            'app.users.avatars.users_repository.get_user_by_identity_id',
            side_effect=_get_user,
        ),
        patch(
            'app.users.avatars._fetch_google_picture_bytes',
        ) as fetch_mock,
    ):
        ok = await avatars_service.ingest_google_picture_if_empty(
            session,
            settings,
            identity_id=identity_id,
            picture_url='https://lh3.googleusercontent.com/a/photo',
        )

    assert ok is False
    fetch_mock.assert_not_called()


@pytest.mark.asyncio
async def test_ingest_google_picture_skips_without_r2() -> None:
    settings = _settings(
        r2_account_id='',
        r2_access_key_id='',
        r2_secret_access_key='',
        r2_bucket='',
        r2_public_base_url='',
    )
    session = MagicMock()
    ok = await avatars_service.ingest_google_picture_if_empty(
        session,
        settings,
        identity_id=uuid.uuid4(),
        picture_url='https://lh3.googleusercontent.com/a/photo',
    )
    assert ok is False
