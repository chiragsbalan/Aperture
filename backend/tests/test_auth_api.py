"""Integration tests for password auth API against Postgres."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from app.auth.security import hash_refresh_token
from app.auth.service import reset_refresh_grace_l1
from app.core.db import session_scope
from app.main import app
from fastapi.testclient import TestClient
from httpx import ASGITransport
from sqlalchemy import text


@pytest.fixture
def api_client() -> TestClient:
    """HTTP client with app lifespan (DB engine)."""
    with TestClient(app) as client:
        yield client


@pytest.fixture(autouse=True)
def _wipe_auth_failed_attempts() -> None:
    """Clear durable rate-limit rows so shared TestClient IPs do not leak."""
    import asyncio

    import asyncpg
    from app.core.config import get_settings

    async def _wipe() -> None:
        dsn = get_settings().database_url.replace(
            'postgresql+asyncpg://',
            'postgresql://',
            1,
        )
        conn = await asyncpg.connect(dsn)
        try:
            await conn.execute('DELETE FROM auth_failed_attempts')
        finally:
            await conn.close()

    asyncio.run(_wipe())


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


def _trusted_ip_headers(
    ip: str,
    *,
    secret: str = 'test-bff-shared-secret',
) -> dict[str, str]:
    """Headers the BFF would send when AUTH_BFF_SHARED_SECRET is set."""
    return {
        'X-Aperture-Client-IP': ip,
        'X-Aperture-BFF-Secret': secret,
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

    # Within grace: reused refresh returns the same successor tokens.
    reused = api_client.post(
        '/api/v1/auth/refresh',
        json={'refresh_token': login_refresh},
    )
    assert reused.status_code == 200, reused.text
    assert reused.json()['refresh_token'] == new_refresh
    assert reused.json()['access_token'] == new_access

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
    api_client.post('/api/v1/auth/logout', json={'refresh_token': refresh})


@pytest.mark.integration
def test_refresh_reuse_within_grace_returns_same_tokens(
    api_client: TestClient,
) -> None:
    register = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(),
    )
    assert register.status_code == 201
    refresh_token = register.json()['refresh_token']

    first = api_client.post(
        '/api/v1/auth/refresh',
        json={'refresh_token': refresh_token},
    )
    assert first.status_code == 200
    second = api_client.post(
        '/api/v1/auth/refresh',
        json={'refresh_token': refresh_token},
    )
    assert second.status_code == 200
    assert second.json()['refresh_token'] == first.json()['refresh_token']
    assert second.json()['access_token'] == first.json()['access_token']


@pytest.mark.integration
def test_refresh_grace_l1_miss_db_hit_returns_same_tokens(
    api_client: TestClient,
) -> None:
    """Durable grace payload survives L1 cache clear within the window."""
    register = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(),
    )
    assert register.status_code == 201
    refresh_token = register.json()['refresh_token']

    first = api_client.post(
        '/api/v1/auth/refresh',
        json={'refresh_token': refresh_token},
    )
    assert first.status_code == 200
    reset_refresh_grace_l1()
    second = api_client.post(
        '/api/v1/auth/refresh',
        json={'refresh_token': refresh_token},
    )
    assert second.status_code == 200, second.text
    assert second.json()['refresh_token'] == first.json()['refresh_token']
    assert second.json()['access_token'] == first.json()['access_token']


@pytest.mark.integration
@pytest.mark.asyncio
async def test_concurrent_double_refresh_both_succeed_within_grace() -> None:
    """Atomic claim + durable grace: both concurrent refreshers succeed."""
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

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()['refresh_token'] == second.json()['refresh_token']


@pytest.mark.integration
@pytest.mark.asyncio
async def test_refresh_reuse_outside_grace_revokes_family() -> None:
    """Stolen refresh after grace revokes the whole family."""
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
            old_refresh = register.json()['refresh_token']

            rotated = await client.post(
                '/api/v1/auth/refresh',
                json={'refresh_token': old_refresh},
            )
            assert rotated.status_code == 200, rotated.text
            new_refresh = rotated.json()['refresh_token']

            # Backdate rotation so the grace window has elapsed.
            token_hash = hash_refresh_token(old_refresh)
            past = datetime.now(UTC) - timedelta(seconds=11)
            async with session_scope() as session:
                await session.execute(
                    text(
                        'UPDATE refresh_sessions'
                        ' SET revoked_at = :past'
                        ' WHERE token_hash = :token_hash'
                    ),
                    {'past': past, 'token_hash': token_hash},
                )
                await session.execute(
                    text(
                        'UPDATE refresh_grace_payloads'
                        ' SET expires_at = :past'
                        ' WHERE token_hash = :token_hash'
                    ),
                    {'past': past, 'token_hash': token_hash},
                )
                await session.commit()
            reset_refresh_grace_l1()

            stolen = await client.post(
                '/api/v1/auth/refresh',
                json={'refresh_token': old_refresh},
            )
            assert stolen.status_code == 401

            # Successor in the same family must also be dead.
            successor = await client.post(
                '/api/v1/auth/refresh',
                json={'refresh_token': new_refresh},
            )
            assert successor.status_code == 401
    finally:
        await dispose_db()


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
def test_login_unknown_identifier_same_error(api_client: TestClient) -> None:
    unknown = api_client.post(
        '/api/v1/auth/login',
        json={
            'identifier': f'missing-{uuid.uuid4().hex[:8]}@example.com',
            'password': 'whatever-password',
        },
    )
    assert unknown.status_code == 401
    assert unknown.json()['detail'] == 'Invalid credentials'


@pytest.mark.integration
def test_trusted_client_ip_header_used_when_secret_matches(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('AUTH_LOGIN_MAX_FAILURES', '3')
    from app.core.config import get_settings

    get_settings.cache_clear()

    email = _unique_email()
    ip = f'203.0.113.{uuid.uuid4().int % 200 + 1}'
    headers = _trusted_ip_headers(ip, secret=secret)
    # Spoofed XFF must be ignored when secret path is active.
    headers['X-Forwarded-For'] = '198.51.100.1'

    api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(email=email),
        headers=headers,
    )
    for _ in range(3):
        bad = api_client.post(
            '/api/v1/auth/login',
            json={'identifier': email, 'password': 'wrong-password'},
            headers=headers,
        )
        assert bad.status_code == 401
    limited = api_client.post(
        '/api/v1/auth/login',
        json={'identifier': email, 'password': 'wrong-password'},
        headers=headers,
    )
    assert limited.status_code == 429


@pytest.mark.integration
def test_login_rate_limit_returns_429(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('AUTH_LOGIN_MAX_FAILURES', '3')
    from app.core.config import get_settings

    get_settings.cache_clear()

    email = _unique_email()
    headers = _trusted_ip_headers(
        f'203.0.113.{uuid.uuid4().int % 200 + 1}',
        secret=secret,
    )
    api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(email=email),
        headers=headers,
    )
    for _ in range(3):
        bad = api_client.post(
            '/api/v1/auth/login',
            json={'identifier': email, 'password': 'wrong-password'},
            headers=headers,
        )
        assert bad.status_code == 401
    limited = api_client.post(
        '/api/v1/auth/login',
        json={'identifier': email, 'password': 'wrong-password'},
        headers=headers,
    )
    assert limited.status_code == 429
    assert limited.json()['detail'] == 'Too many attempts. Try again later.'


@pytest.mark.integration
def test_login_success_clears_ip_bucket(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('AUTH_LOGIN_MAX_FAILURES', '3')
    from app.core.config import get_settings

    get_settings.cache_clear()

    email = _unique_email()
    password = 'secure-pass-1'
    headers = _trusted_ip_headers(
        f'203.0.113.{uuid.uuid4().int % 200 + 1}',
        secret=secret,
    )
    api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(email=email, password=password),
        headers=headers,
    )
    for _ in range(2):
        bad = api_client.post(
            '/api/v1/auth/login',
            json={'identifier': email, 'password': 'wrong-password'},
            headers=headers,
        )
        assert bad.status_code == 401
    ok = api_client.post(
        '/api/v1/auth/login',
        json={'identifier': email, 'password': password},
        headers=headers,
    )
    assert ok.status_code == 200, ok.text
    # After success, IP bucket is clear — two more failures must not 429 yet.
    for _ in range(2):
        bad = api_client.post(
            '/api/v1/auth/login',
            json={'identifier': email, 'password': 'wrong-password'},
            headers=headers,
        )
        assert bad.status_code == 401
    still_ok_path = api_client.post(
        '/api/v1/auth/login',
        json={'identifier': email, 'password': 'wrong-password'},
        headers=headers,
    )
    assert still_ok_path.status_code == 401


@pytest.mark.integration
def test_register_rate_limit_returns_429(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('AUTH_REGISTER_MAX_FAILURES', '2')
    from app.core.config import get_settings

    get_settings.cache_clear()

    email = _unique_email()
    headers = _trusted_ip_headers(
        f'198.51.100.{uuid.uuid4().int % 200 + 1}',
        secret=secret,
    )
    first = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(email=email),
        headers=headers,
    )
    assert first.status_code == 201
    for _ in range(2):
        conflict = api_client.post(
            '/api/v1/auth/register',
            json=_register_payload(email=email),
            headers=headers,
        )
        assert conflict.status_code == 409
    limited = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(email=email),
        headers=headers,
    )
    assert limited.status_code == 429


@pytest.mark.integration
def test_refresh_success_does_not_burn_quota(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('AUTH_REFRESH_MAX_PER_IP', '2')
    from app.core.config import get_settings

    get_settings.cache_clear()

    headers = _trusted_ip_headers(
        f'192.0.2.{uuid.uuid4().int % 200 + 1}',
        secret=secret,
    )
    register = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(),
        headers=headers,
    )
    assert register.status_code == 201
    refresh_token = register.json()['refresh_token']

    # Many successful rotations must not hit the failure-only cap of 2.
    for _ in range(5):
        rotated = api_client.post(
            '/api/v1/auth/refresh',
            json={'refresh_token': refresh_token},
            headers=headers,
        )
        assert rotated.status_code == 200, rotated.text
        refresh_token = rotated.json()['refresh_token']

    # Failures do burn quota.
    for _ in range(2):
        bad = api_client.post(
            '/api/v1/auth/refresh',
            json={'refresh_token': 'not-a-real-refresh-token'},
            headers=headers,
        )
        assert bad.status_code == 401
    limited = api_client.post(
        '/api/v1/auth/refresh',
        json={'refresh_token': refresh_token},
        headers=headers,
    )
    assert limited.status_code == 429


@pytest.mark.integration
@pytest.mark.asyncio
async def test_concurrent_failed_attempt_upsert_is_safe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Atomic ON CONFLICT upsert must not lose concurrent increments."""
    from app.auth import rate_limit as auth_rate_limit
    from app.auth import repository as auth_repository
    from app.core.config import get_settings
    from app.core.db import dispose_db, init_db

    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    get_settings.cache_clear()
    settings = get_settings()
    init_db(settings)
    subject = f'ip:concurrent-{uuid.uuid4().hex}'
    try:

        async def _bump() -> None:
            async with session_scope() as session:
                await auth_repository.upsert_failed_attempt(
                    session,
                    action=auth_rate_limit.ACTION_LOGIN,
                    subject_key=subject,
                    window_started_at=datetime.now(UTC),
                    window_seconds=settings.auth_rate_limit_window_seconds,
                )
                await session.commit()

        await asyncio.gather(*[_bump() for _ in range(8)])

        async with session_scope() as session:
            row = await auth_repository.get_failed_attempt(
                session,
                action=auth_rate_limit.ACTION_LOGIN,
                subject_key=subject,
            )
            assert row is not None
            assert row.attempt_count == 8
    finally:
        await dispose_db()
        get_settings.cache_clear()


@pytest.mark.integration
def test_me_requires_auth(api_client: TestClient) -> None:
    res = api_client.get('/api/v1/auth/me')
    assert res.status_code == 401
