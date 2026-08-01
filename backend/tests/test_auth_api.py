"""Integration tests for password auth API against Postgres."""

from __future__ import annotations

import asyncio
import uuid

import httpx
import pytest
from app.main import app
from fastapi.testclient import TestClient
from httpx import ASGITransport


@pytest.fixture
def api_client() -> TestClient:
    """HTTP client with app lifespan (DB engine)."""
    with TestClient(app) as client:
        yield client


def _unique_email() -> str:
    return f'user-{uuid.uuid4().hex[:12]}@example.com'


def _unique_username() -> str:
    return f'u_{uuid.uuid4().hex[:10]}'


def _register_payload(
    *,
    email: str | None = None,
    username: str | None = None,
    password: str = 'secure-pass-1',
) -> dict[str, str]:
    return {
        'email': email or _unique_email(),
        'username': username or _unique_username(),
        'password': password,
    }


@pytest.mark.integration
def test_register_login_me_refresh_logout(api_client: TestClient) -> None:
    email = _unique_email()
    username = _unique_username()
    password = 'secure-pass-1'

    register = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(email=email, username=username, password=password),
    )
    assert register.status_code == 201, register.text
    body = register.json()
    assert body['token_type'] == 'bearer'
    assert body['expires_in'] == 900
    assert body['access_token']
    assert body['refresh_token']
    access = body['access_token']
    refresh = body['refresh_token']

    me = api_client.get(
        '/api/v1/auth/me',
        headers={'Authorization': f'Bearer {access}'},
    )
    assert me.status_code == 200, me.text
    me_body = me.json()
    assert me_body['email'] == email
    assert me_body['user'] is not None
    assert me_body['user']['username'] == username

    login_email = api_client.post(
        '/api/v1/auth/login',
        json={'identifier': email.upper(), 'password': password},
    )
    assert login_email.status_code == 200, login_email.text

    login_user = api_client.post(
        '/api/v1/auth/login',
        json={'identifier': username.upper(), 'password': password},
    )
    assert login_user.status_code == 200, login_user.text
    login_access = login_user.json()['access_token']
    login_refresh = login_user.json()['refresh_token']

    rotated = api_client.post(
        '/api/v1/auth/refresh',
        json={'refresh_token': login_refresh},
    )
    assert rotated.status_code == 200, rotated.text
    new_refresh = rotated.json()['refresh_token']
    new_access = rotated.json()['access_token']
    assert new_refresh != login_refresh

    # Old refresh rejected after rotation (full grace window is P1.2).
    stale = api_client.post(
        '/api/v1/auth/refresh',
        json={'refresh_token': login_refresh},
    )
    assert stale.status_code == 401

    # Old access invalidated via sid binding after rotation.
    stale_access = api_client.get(
        '/api/v1/auth/me',
        headers={'Authorization': f'Bearer {login_access}'},
    )
    assert stale_access.status_code == 401

    me2 = api_client.get(
        '/api/v1/auth/me',
        headers={'Authorization': f'Bearer {new_access}'},
    )
    assert me2.status_code == 200

    logout = api_client.post(
        '/api/v1/auth/logout',
        json={'refresh_token': new_refresh},
    )
    assert logout.status_code == 204

    after_logout = api_client.post(
        '/api/v1/auth/refresh',
        json={'refresh_token': new_refresh},
    )
    assert after_logout.status_code == 401

    # Logout invalidates the access JWT bound to that session.
    after_logout_me = api_client.get(
        '/api/v1/auth/me',
        headers={'Authorization': f'Bearer {new_access}'},
    )
    assert after_logout_me.status_code == 401

    # Original register refresh still works until used/revoked independently.
    # Revoke it for cleanliness.
    api_client.post('/api/v1/auth/logout', json={'refresh_token': refresh})


@pytest.mark.integration
def test_sequential_double_refresh_rejects_second(api_client: TestClient) -> None:
    register = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(),
    )
    assert register.status_code == 201
    refresh_token = register.json()['refresh_token']
    old_access = register.json()['access_token']

    first = api_client.post(
        '/api/v1/auth/refresh',
        json={'refresh_token': refresh_token},
    )
    assert first.status_code == 200
    second = api_client.post(
        '/api/v1/auth/refresh',
        json={'refresh_token': refresh_token},
    )
    assert second.status_code == 401

    stale_me = api_client.get(
        '/api/v1/auth/me',
        headers={'Authorization': f'Bearer {old_access}'},
    )
    assert stale_me.status_code == 401

    fresh_me = api_client.get(
        '/api/v1/auth/me',
        headers={'Authorization': f'Bearer {first.json()["access_token"]}'},
    )
    assert fresh_me.status_code == 200


@pytest.mark.integration
@pytest.mark.asyncio
async def test_concurrent_double_refresh_single_winner() -> None:
    """Atomic claim: exactly one concurrent refresh succeeds."""
    from app.core.config import get_settings
    from app.core.db import dispose_db, init_db

    init_db(get_settings())
    try:
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url='http://test',
        ) as client:
            register = await client.post(
                '/api/v1/auth/register',
                json=_register_payload(),
            )
            assert register.status_code == 201, register.text
            refresh_token = register.json()['refresh_token']

            first, second = await asyncio.gather(
                client.post(
                    '/api/v1/auth/refresh',
                    json={'refresh_token': refresh_token},
                ),
                client.post(
                    '/api/v1/auth/refresh',
                    json={'refresh_token': refresh_token},
                ),
            )
    finally:
        await dispose_db()

    codes = sorted([first.status_code, second.status_code])
    assert codes == [200, 401]


@pytest.mark.integration
def test_register_duplicate_email_conflict(api_client: TestClient) -> None:
    email = _unique_email()
    first = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(email=email),
    )
    assert first.status_code == 201
    second = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(email=email),
    )
    assert second.status_code == 409
    assert second.json()['detail'] == 'Email already registered'


@pytest.mark.integration
def test_register_duplicate_username_conflict(api_client: TestClient) -> None:
    username = _unique_username()
    first = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(username=username),
    )
    assert first.status_code == 201
    second = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(username=username),
    )
    assert second.status_code == 409
    assert second.json()['detail'] == 'Username already taken'


@pytest.mark.integration
def test_login_wrong_password(api_client: TestClient) -> None:
    email = _unique_email()
    api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(email=email),
    )
    bad = api_client.post(
        '/api/v1/auth/login',
        json={'identifier': email, 'password': 'wrong-password'},
    )
    assert bad.status_code == 401
    assert bad.json()['detail'] == 'Invalid credentials'


@pytest.mark.integration
def test_me_requires_auth(api_client: TestClient) -> None:
    res = api_client.get('/api/v1/auth/me')
    assert res.status_code == 401
