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
    body_public = public.json()
    assert body_public['username'] == username
    assert body_public['display_name'] == 'Ada Lovelace'
    assert body_public['bio'] == 'Notes on the analytical engine.'
    assert body_public['avatar_url'] is None
    assert body_public['website_url'] is None
    assert body_public['links'] == []
    assert body_public['is_owner'] is False
    assert body_public['counts'] == {
        'movies': 0,
        'shows': 0,
        'followers': 0,
        'following': 0,
    }
    assert 'surfaces' not in body_public
    assert 'preferences' not in body_public
    assert 'email' not in body_public

    owner_view = api_client.get(f'/api/v1/users/{username}', headers=headers)
    assert owner_view.status_code == 200
    assert owner_view.json()['is_owner'] is True
    assert owner_view.json()['counts'] == body_public['counts']


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


@pytest.mark.integration
def test_profile_patch_rejects_non_https_urls(api_client: TestClient) -> None:
    access, _username, _email = _register(api_client)
    headers = {'Authorization': f'Bearer {access}'}

    for field, value in (
        ('avatar_url', 'http://example.com/avatar.png'),
        ('avatar_url', 'javascript:alert(1)'),
        ('website_url', 'http://example.com'),
        ('website_url', 'javascript:alert(1)'),
    ):
        res = api_client.patch(
            '/api/v1/users/me',
            headers=headers,
            json={field: value},
        )
        assert res.status_code == 422, (field, value, res.text)

    links_http = api_client.patch(
        '/api/v1/users/me',
        headers=headers,
        json={'links': [{'label': 'Blog', 'url': 'http://example.com/blog'}]},
    )
    assert links_http.status_code == 422, links_http.text

    links_js = api_client.patch(
        '/api/v1/users/me',
        headers=headers,
        json={'links': [{'label': 'X', 'url': 'javascript:alert(1)'}]},
    )
    assert links_js.status_code == 422, links_js.text


@pytest.mark.integration
def test_soft_deleted_user_public_routes_are_404(api_client: TestClient) -> None:
    access, username, _email = _register(api_client)
    headers = {'Authorization': f'Bearer {access}'}

    # Confirm live before soft-delete (profile shell + empty public diary).
    assert api_client.get(f'/api/v1/users/{username}').status_code == 200
    live_diary = api_client.get(f'/api/v1/users/{username}/watch-entries')
    assert live_diary.status_code == 200, live_diary.text

    import asyncio

    import asyncpg
    from app.core.config import get_settings

    async def _soft_delete() -> None:
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
                SET deleted_at = $1
                WHERE username = $2
                """,
                datetime.now(UTC),
                username,
            )
        finally:
            await conn.close()

    asyncio.run(_soft_delete())

    assert api_client.get(f'/api/v1/users/{username}').status_code == 404
    assert api_client.get(f'/api/v1/users/{username}/watch-entries').status_code == 404
    # Owner token must not resurrect a soft-deleted public shell.
    assert (
        api_client.get(f'/api/v1/users/{username}', headers=headers).status_code == 404
    )


def _trusted_ip_headers(ip: str, *, secret: str) -> dict[str, str]:
    return {
        'X-Aperture-Client-IP': ip,
        'X-Aperture-BFF-Secret': secret,
    }


@pytest.mark.integration
def test_public_profile_rate_limit_trusted_ip_returns_429(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('USERS_PUBLIC_RATE_LIMIT_MAX_PER_IP', '2')
    from app.core.config import get_settings

    get_settings.cache_clear()

    _access, username, _email = _register(api_client)
    ip = f'203.0.113.{uuid.uuid4().int % 200 + 1}'
    headers = _trusted_ip_headers(ip, secret=secret)

    for _ in range(2):
        ok = api_client.get(f'/api/v1/users/{username}', headers=headers)
        assert ok.status_code == 200, ok.text

    limited = api_client.get(
        f'/api/v1/users/{username}/watch-entries',
        headers=headers,
    )
    assert limited.status_code == 429
    assert limited.json()['detail'] == ('Too many profile requests. Try again later.')
