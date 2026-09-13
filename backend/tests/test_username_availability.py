"""Integration tests for BFF-gated username availability (ADR-0018)."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

import asyncpg
import pytest
from app.core.config import get_settings
from fastapi.testclient import TestClient


def _unique_username() -> str:
    return f'ua_{uuid.uuid4().hex[:10]}'


def _register(api_client: TestClient) -> tuple[str, str, str]:
    username = _unique_username()
    email = f'{username}@example.com'
    password = 'password-ok-12'
    res = api_client.post(
        '/api/v1/auth/register',
        json={'email': email, 'username': username, 'password': password},
    )
    assert res.status_code == 201, res.text
    return res.json()['access_token'], username, email


def _bff_headers(ip: str, *, secret: str) -> dict[str, str]:
    return {
        'X-Aperture-Client-IP': ip,
        'X-Aperture-BFF-Secret': secret,
    }


@pytest.fixture
def api_client(client: TestClient) -> TestClient:
    return client


@pytest.mark.integration
def test_username_availability_requires_bff_secret(
    api_client: TestClient,
) -> None:
    res = api_client.get(
        '/api/v1/users/username-availability',
        params={'username': 'someone'},
    )
    assert res.status_code == 403


@pytest.mark.integration
def test_username_availability_invalid_taken_available(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    get_settings.cache_clear()

    headers = _bff_headers('203.0.113.40', secret=secret)

    invalid = api_client.get(
        '/api/v1/users/username-availability',
        params={'username': 'ab'},
        headers=headers,
    )
    assert invalid.status_code == 200
    assert invalid.json() == {'status': 'invalid'}

    reserved = api_client.get(
        '/api/v1/users/username-availability',
        params={'username': 'admin'},
        headers=headers,
    )
    assert reserved.status_code == 200
    assert reserved.json() == {'status': 'taken'}

    _access, username, _email = _register(api_client)
    taken = api_client.get(
        '/api/v1/users/username-availability',
        params={'username': username},
        headers=headers,
    )
    assert taken.status_code == 200
    assert taken.json() == {'status': 'taken'}

    free = api_client.get(
        '/api/v1/users/username-availability',
        params={'username': _unique_username()},
        headers=headers,
    )
    assert free.status_code == 200
    assert free.json() == {'status': 'available'}


@pytest.mark.integration
def test_username_availability_soft_deleted_is_taken(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    get_settings.cache_clear()

    _access, username, _email = _register(api_client)

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

    headers = _bff_headers('203.0.113.41', secret=secret)
    live = api_client.get(
        '/api/v1/users/username-availability',
        params={'username': username},
        headers=headers,
    )
    assert live.status_code == 200
    assert live.json() == {'status': 'taken'}

    # Register must also treat soft-deleted as taken.
    conflict = api_client.post(
        '/api/v1/auth/register',
        json={
            'email': f'reclaim_{uuid.uuid4().hex[:8]}@example.com',
            'username': username,
            'password': 'password-ok-12',
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()['detail'] == 'Username already taken'


@pytest.mark.integration
def test_username_availability_own_username_is_available(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    get_settings.cache_clear()

    access, username, _email = _register(api_client)
    headers = {
        **_bff_headers('203.0.113.42', secret=secret),
        'Authorization': f'Bearer {access}',
    }
    res = api_client.get(
        '/api/v1/users/username-availability',
        params={'username': username},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json() == {'status': 'available'}


@pytest.mark.integration
def test_username_availability_rate_limit(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('USERNAME_AVAILABILITY_RATE_LIMIT_MAX_PER_IP', '2')
    get_settings.cache_clear()

    ip = f'203.0.113.{uuid.uuid4().int % 200 + 1}'
    headers = _bff_headers(ip, secret=secret)
    for _ in range(2):
        ok = api_client.get(
            '/api/v1/users/username-availability',
            params={'username': _unique_username()},
            headers=headers,
        )
        assert ok.status_code == 200, ok.text

    limited = api_client.get(
        '/api/v1/users/username-availability',
        params={'username': _unique_username()},
        headers=headers,
    )
    assert limited.status_code == 429
    assert limited.json()['detail'] == (
        'Too many username checks. Try again later.'
    )


@pytest.mark.integration
def test_bloom_negative_does_not_claim_taken_without_db(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Bloom may short-circuit available; never invent taken without DB."""
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('USERNAME_BLOOM_ENABLED', 'true')
    get_settings.cache_clear()

    headers = _bff_headers('203.0.113.43', secret=secret)
    candidate = _unique_username()
    res = api_client.get(
        '/api/v1/users/username-availability',
        params={'username': candidate},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json() == {'status': 'available'}
