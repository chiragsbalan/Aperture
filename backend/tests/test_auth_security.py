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
)
from app.core.config import Settings


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
