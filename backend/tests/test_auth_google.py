"""Integration tests for Google OAuth auth API (P1.3)."""

from __future__ import annotations

import asyncio
import uuid

import asyncpg
import pytest
from app.core.config import get_settings
from app.main import app
from fastapi.testclient import TestClient

from tests.test_auth_api import (
    _register_payload,
    _trusted_ip_headers,
    _unique_email,
    _unique_username,
)


@pytest.fixture
def api_client() -> TestClient:
    """HTTP client with app lifespan (DB engine)."""
    with TestClient(app) as client:
        yield client


@pytest.fixture(autouse=True)
def _wipe_auth_failed_attempts() -> None:
    """Clear durable rate-limit rows so shared TestClient IPs do not leak."""

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


def _google_payload(
    *,
    sub: str | None = None,
    email: str | None = None,
    given_name: str | None = 'Ada',
    family_name: str | None = 'Lovelace',
    intent: str = 'sign_in',
) -> dict[str, object]:
    return {
        'sub': sub or f'google-sub-{uuid.uuid4().hex[:16]}',
        'email': email or _unique_email(),
        'given_name': given_name,
        'family_name': family_name,
        'intent': intent,
    }


def _bff_headers(ip: str = '203.0.113.50') -> dict[str, str]:
    return _trusted_ip_headers(ip)


@pytest.mark.integration
def test_google_new_user_seeds_username_and_providers(
    api_client: TestClient,
) -> None:
    family = uuid.uuid4().hex[:10]
    payload = _google_payload(given_name='Ada', family_name=family)
    expected_username = f'ada_{family}'
    res = api_client.post(
        '/api/v1/auth/google',
        json=payload,
        headers=_bff_headers(),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['access_token']
    assert body['refresh_token']

    me = api_client.get(
        '/api/v1/auth/me',
        headers={'Authorization': f'Bearer {body["access_token"]}'},
    )
    assert me.status_code == 200, me.text
    me_body = me.json()
    assert me_body['email'] == payload['email']
    assert me_body['providers'] == ['google']
    assert me_body['user'] is not None
    assert me_body['user']['username'] == expected_username
    assert me_body['user']['display_name'] == f'Ada {family}'


@pytest.mark.integration
def test_google_existing_login_returns_tokens(api_client: TestClient) -> None:
    payload = _google_payload()
    first = api_client.post(
        '/api/v1/auth/google',
        json=payload,
        headers=_bff_headers(),
    )
    assert first.status_code == 200, first.text

    second = api_client.post(
        '/api/v1/auth/google',
        json=payload,
        headers=_bff_headers(),
    )
    assert second.status_code == 200, second.text
    assert second.json()['access_token']

    me = api_client.get(
        '/api/v1/auth/me',
        headers={
            'Authorization': f'Bearer {second.json()["access_token"]}',
        },
    )
    assert me.status_code == 200
    assert me.json()['providers'] == ['google']


@pytest.mark.integration
def test_google_email_collision_no_auto_link(api_client: TestClient) -> None:
    email = _unique_email()
    username = _unique_username()
    password = 'secure-pass-1'
    register = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(email=email, username=username, password=password),
    )
    assert register.status_code == 201, register.text

    google = api_client.post(
        '/api/v1/auth/google',
        json=_google_payload(email=email),
        headers=_bff_headers(),
    )
    assert google.status_code == 409, google.text
    detail = google.json()['detail']
    assert 'already exists' in detail.lower()
    assert 'link google' in detail.lower()


@pytest.mark.integration
def test_google_link_success(api_client: TestClient) -> None:
    email = _unique_email()
    register = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(email=email, password='secure-pass-1'),
    )
    assert register.status_code == 201, register.text
    access = register.json()['access_token']

    sub = f'google-sub-{uuid.uuid4().hex[:16]}'
    link = api_client.post(
        '/api/v1/auth/google',
        json=_google_payload(
            sub=sub,
            email=f'other-{uuid.uuid4().hex[:8]}@example.com',
            intent='link',
        ),
        headers={
            **_bff_headers(),
            'Authorization': f'Bearer {access}',
        },
    )
    assert link.status_code == 200, link.text

    me = api_client.get(
        '/api/v1/auth/me',
        headers={'Authorization': f'Bearer {link.json()["access_token"]}'},
    )
    assert me.status_code == 200, me.text
    assert me.json()['providers'] == ['password', 'google']


@pytest.mark.integration
def test_google_link_requires_bearer(api_client: TestClient) -> None:
    res = api_client.post(
        '/api/v1/auth/google',
        json=_google_payload(intent='link'),
        headers=_bff_headers(),
    )
    assert res.status_code == 401, res.text


@pytest.mark.integration
def test_google_link_sub_taken(api_client: TestClient) -> None:
    sub = f'google-sub-{uuid.uuid4().hex[:16]}'
    first = api_client.post(
        '/api/v1/auth/google',
        json=_google_payload(sub=sub),
        headers=_bff_headers(),
    )
    assert first.status_code == 200, first.text

    register = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(password='secure-pass-1'),
    )
    assert register.status_code == 201, register.text
    access = register.json()['access_token']

    link = api_client.post(
        '/api/v1/auth/google',
        json=_google_payload(
            sub=sub,
            email=_unique_email(),
            intent='link',
        ),
        headers={
            **_bff_headers(),
            'Authorization': f'Bearer {access}',
        },
    )
    assert link.status_code == 409, link.text
    assert 'already linked' in link.json()['detail'].lower()


@pytest.mark.integration
def test_me_providers_password_only(api_client: TestClient) -> None:
    register = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(password='secure-pass-1'),
    )
    assert register.status_code == 201, register.text
    me = api_client.get(
        '/api/v1/auth/me',
        headers={'Authorization': f'Bearer {register.json()["access_token"]}'},
    )
    assert me.status_code == 200
    assert me.json()['providers'] == ['password']


@pytest.mark.integration
def test_google_rejects_without_bff_secret(api_client: TestClient) -> None:
    res = api_client.post(
        '/api/v1/auth/google',
        json=_google_payload(),
    )
    assert res.status_code == 403, res.text

    wrong = api_client.post(
        '/api/v1/auth/google',
        json=_google_payload(),
        headers={
            'X-Aperture-Client-IP': '203.0.113.9',
            'X-Aperture-BFF-Secret': 'wrong-secret',
        },
    )
    assert wrong.status_code == 403, wrong.text


@pytest.mark.integration
def test_google_username_collision_gets_suffix(api_client: TestClient) -> None:
    family = uuid.uuid4().hex[:12]
    expected_base = f'col_{family}'
    taken = api_client.post(
        '/api/v1/auth/register',
        json=_register_payload(
            username=expected_base,
            password='secure-pass-1',
        ),
    )
    assert taken.status_code == 201, taken.text

    google = api_client.post(
        '/api/v1/auth/google',
        json=_google_payload(given_name='Col', family_name=family),
        headers=_bff_headers(),
    )
    assert google.status_code == 200, google.text
    me = api_client.get(
        '/api/v1/auth/me',
        headers={'Authorization': f'Bearer {google.json()["access_token"]}'},
    )
    assert me.status_code == 200
    username = me.json()['user']['username']
    assert username.startswith(f'{expected_base}_')
    assert username != expected_base
