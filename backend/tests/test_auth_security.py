"""Unit tests for Argon2id hashing and JWT helpers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from app.auth.security import (
    decode_access_token,
    hash_password,
    hash_refresh_token,
    issue_access_token,
    new_refresh_token,
    normalize_email,
    verify_password,
    verify_password_or_dummy,
)
from app.core.cache import InMemoryCacheBackend
from app.core.config import Settings
from app.core.security import hash_rate_limit_subject
from app.core.trusted_client import resolve_client_ip


def _settings() -> Settings:
    return Settings(
        database_url='postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
        jwt_secret='unit-test-secret-at-least-32-bytes-long',
        access_token_ttl_seconds=900,
        refresh_token_ttl_seconds=2592000,
    )


def test_hash_and_verify_password() -> None:
    hashed = hash_password('correct horse battery')
    assert hashed != 'correct horse battery'
    assert verify_password(hashed, 'correct horse battery')
    assert not verify_password(hashed, 'wrong password')


def test_refresh_token_hash_is_deterministic() -> None:
    raw = new_refresh_token()
    assert hash_refresh_token(raw) == hash_refresh_token(raw)
    assert hash_refresh_token(raw) != raw
    assert len(hash_refresh_token(raw)) == 64


def test_issue_and_decode_access_token() -> None:
    settings = _settings()
    identity_id = uuid.uuid4()
    session_id = uuid.uuid4()
    token, expires_in = issue_access_token(
        settings=settings,
        identity_id=identity_id,
        session_id=session_id,
    )
    assert expires_in == 900
    payload = decode_access_token(settings, token)
    assert payload['sub'] == str(identity_id)
    assert payload['sid'] == str(session_id)


def test_decode_rejects_tampered_token() -> None:
    settings = _settings()
    token, _ = issue_access_token(
        settings=settings,
        identity_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
    )
    with pytest.raises(jwt.PyJWTError):
        decode_access_token(settings, token + 'x')


def test_decode_rejects_expired_token() -> None:
    settings = _settings()
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            'sub': str(uuid.uuid4()),
            'sid': str(uuid.uuid4()),
            'iat': now - timedelta(hours=1),
            'exp': now - timedelta(minutes=1),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(settings, token)


def test_normalize_email() -> None:
    assert normalize_email('  Alex@Example.COM ') == 'alex@example.com'


def test_verify_password_or_dummy_unknown_identity() -> None:
    assert verify_password_or_dummy(None, 'any-password') is False


def test_verify_password_or_dummy_with_hash() -> None:
    hashed = hash_password('correct horse battery')
    assert verify_password_or_dummy(hashed, 'correct horse battery')
    assert not verify_password_or_dummy(hashed, 'wrong')


def test_hash_rate_limit_subject_is_stable() -> None:
    assert hash_rate_limit_subject('a@b.com') == hash_rate_limit_subject('a@b.com')
    assert hash_rate_limit_subject('a@b.com') != 'a@b.com'


def test_client_ip_trusts_aperture_header_only_with_secret() -> None:
    from starlette.requests import Request

    settings = Settings(
        database_url='postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
        jwt_secret='unit-test-secret-at-least-32-bytes-long',
        auth_bff_shared_secret='shared-secret-value',
    )

    async def _receive() -> dict[str, object]:
        return {'type': 'http.request'}

    scope = {
        'type': 'http',
        'asgi': {'version': '3.0'},
        'http_version': '1.1',
        'method': 'POST',
        'scheme': 'http',
        'path': '/api/v1/auth/login',
        'raw_path': b'/api/v1/auth/login',
        'query_string': b'',
        'headers': [
            (b'x-aperture-client-ip', b'203.0.113.50'),
            (b'x-aperture-bff-secret', b'shared-secret-value'),
            (b'x-forwarded-for', b'198.51.100.1'),
        ],
        'client': ('127.0.0.1', 12345),
        'server': ('test', 80),
    }
    request = Request(scope, _receive)
    assert resolve_client_ip(request, settings) == '203.0.113.50'

    bad_secret_settings = Settings(
        database_url='postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
        jwt_secret='unit-test-secret-at-least-32-bytes-long',
        auth_bff_shared_secret='shared-secret-value',
    )
    bad_scope = {
        **scope,
        'headers': [
            (b'x-aperture-client-ip', b'203.0.113.50'),
            (b'x-aperture-bff-secret', b'wrong-secret-value!'),
            (b'x-forwarded-for', b'198.51.100.1'),
        ],
    }
    bad_request = Request(bad_scope, _receive)
    assert resolve_client_ip(bad_request, bad_secret_settings) == '127.0.0.1'

    empty_secret = Settings(
        database_url='postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
        jwt_secret='unit-test-secret-at-least-32-bytes-long',
        auth_bff_shared_secret='',
    )
    assert resolve_client_ip(request, empty_secret) == '127.0.0.1'

    whitespace_scope = {
        **scope,
        'headers': [
            (b'x-aperture-client-ip', b'   '),
            (b'x-aperture-bff-secret', b'shared-secret-value'),
        ],
    }
    whitespace_request = Request(whitespace_scope, _receive)
    assert resolve_client_ip(whitespace_request, settings) == '127.0.0.1'

    long_ip = '9' * 80
    long_scope = {
        **scope,
        'headers': [
            (b'x-aperture-client-ip', long_ip.encode()),
            (b'x-aperture-bff-secret', b'shared-secret-value'),
        ],
    }
    long_request = Request(long_scope, _receive)
    assert resolve_client_ip(long_request, settings) == '9' * 64


@pytest.mark.asyncio
async def test_in_memory_cache_ttl() -> None:
    cache = InMemoryCacheBackend()
    await cache.set('k', 'v', ttl_seconds=60)
    assert await cache.get('k') == 'v'
    await cache.set('k', 'v', ttl_seconds=0)
    assert await cache.get('k') is None
