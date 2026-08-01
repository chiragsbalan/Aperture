"""Integration tests for Users profile / preferences API."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def api_client() -> TestClient:
    with TestClient(app) as client:
        yield client


def _unique_email() -> str:
    return f'profile-{uuid.uuid4().hex[:12]}@example.com'


def _unique_username() -> str:
    return f'p_{uuid.uuid4().hex[:10]}'


def _register(api_client: TestClient) -> tuple[str, str, str]:
    email = _unique_email()
    username = _unique_username()
    password = 'secure-pass-1'
    res = api_client.post(
        '/api/v1/auth/register',
        json={'email': email, 'username': username, 'password': password},
    )
    assert res.status_code == 201, res.text
    access = res.json()['access_token']
    return access, username, email


@pytest.mark.integration
def test_get_patch_me_and_public_profile(api_client: TestClient) -> None:
    access, username, _email = _register(api_client)
    headers = {'Authorization': f'Bearer {access}'}

    me = api_client.get('/api/v1/users/me', headers=headers)
    assert me.status_code == 200, me.text
    body = me.json()
    assert body['username'] == username
    assert body['bio'] is None
    assert body['preferences'] == {
        'theme': 'system',
        'spoilers': 'show',
        'language': 'en',
    }
    assert body['username_rename_available_at'] is None

    patched = api_client.patch(
        '/api/v1/users/me',
        headers=headers,
        json={
            'display_name': 'Ada Lovelace',
            'bio': 'Notes on the analytical engine.',
        },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()['display_name'] == 'Ada Lovelace'
    assert patched.json()['bio'] == 'Notes on the analytical engine.'

    public = api_client.get(f'/api/v1/users/{username}')
    assert public.status_code == 200, public.text
    assert public.json() == {
        'username': username,
        'display_name': 'Ada Lovelace',
        'bio': 'Notes on the analytical engine.',
    }
    assert 'preferences' not in public.json()
    assert 'email' not in public.json()


@pytest.mark.integration
def test_preferences_patch_and_get(api_client: TestClient) -> None:
    access, _username, _email = _register(api_client)
    headers = {'Authorization': f'Bearer {access}'}

    updated = api_client.patch(
        '/api/v1/users/me/preferences',
        headers=headers,
        json={'theme': 'dark', 'spoilers': 'hide', 'language': 'en-us'},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json() == {
        'theme': 'dark',
        'spoilers': 'hide',
        'language': 'en-us',
    }

    fetched = api_client.get('/api/v1/users/me/preferences', headers=headers)
    assert fetched.status_code == 200
    assert fetched.json() == updated.json()


@pytest.mark.integration
def test_atomic_profile_and_preferences_patch(api_client: TestClient) -> None:
    access, _username, _email = _register(api_client)
    headers = {'Authorization': f'Bearer {access}'}

    patched = api_client.patch(
        '/api/v1/users/me',
        headers=headers,
        json={
            'display_name': 'Atomic',
            'bio': None,
            'preferences': {
                'theme': 'light',
                'spoilers': 'hide',
                'language': 'en',
            },
        },
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body['display_name'] == 'Atomic'
    assert body['bio'] is None
    assert body['preferences']['theme'] == 'light'
    assert body['preferences']['spoilers'] == 'hide'


@pytest.mark.integration
def test_unauthenticated_me_is_401(api_client: TestClient) -> None:
    assert api_client.get('/api/v1/users/me').status_code == 401
    assert api_client.patch('/api/v1/users/me', json={'bio': 'x'}).status_code == 401


@pytest.mark.integration
def test_duplicate_and_reserved_username(api_client: TestClient) -> None:
    access_a, username_a, _ = _register(api_client)
    access_b, _username_b, _ = _register(api_client)

    conflict = api_client.patch(
        '/api/v1/users/me',
        headers={'Authorization': f'Bearer {access_b}'},
        json={'username': username_a},
    )
    assert conflict.status_code == 409, conflict.text

    reserved = api_client.patch(
        '/api/v1/users/me',
        headers={'Authorization': f'Bearer {access_a}'},
        json={'username': 'settings'},
    )
    assert reserved.status_code == 409, reserved.text

    register_reserved = api_client.post(
        '/api/v1/auth/register',
        json={
            'email': _unique_email(),
            'username': 'admin',
            'password': 'secure-pass-1',
        },
    )
    assert register_reserved.status_code == 409


@pytest.mark.integration
def test_username_rename_cooldown(api_client: TestClient) -> None:
    access, username, _ = _register(api_client)
    headers = {'Authorization': f'Bearer {access}'}
    next_name = _unique_username()

    first = api_client.patch(
        '/api/v1/users/me',
        headers=headers,
        json={'username': next_name},
    )
    assert first.status_code == 200, first.text
    assert first.json()['username'] == next_name
    assert first.json()['username_changed_at'] is not None

    blocked = api_client.patch(
        '/api/v1/users/me',
        headers=headers,
        json={'username': _unique_username()},
    )
    assert blocked.status_code == 429, blocked.text

    # Simulate cooldown elapsed via a fresh asyncpg connection (avoid loop clash).
    import asyncio

    import asyncpg
    from app.core.config import get_settings

    async def _backdate() -> None:
        dsn = get_settings().database_url.replace(
            'postgresql+asyncpg://',
            'postgresql://',
            1,
        )
        conn = await asyncpg.connect(dsn)
        try:
            await conn.execute(
                """
                UPDATE users
                SET username_changed_at = $1
                WHERE username = $2
                """,
                datetime.now(UTC) - timedelta(days=31),
                next_name,
            )
        finally:
            await conn.close()

    asyncio.run(_backdate())

    allowed = api_client.patch(
        '/api/v1/users/me',
        headers=headers,
        json={'username': _unique_username()},
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()['username'] != next_name
    assert allowed.json()['username'] != username


@pytest.mark.integration
def test_public_profile_missing_is_404(api_client: TestClient) -> None:
    res = api_client.get('/api/v1/users/no_such_user_zzz')
    assert res.status_code == 404
