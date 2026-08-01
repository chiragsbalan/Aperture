"""Password hashing, JWT access tokens, and opaque refresh helpers."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import Settings

_PASSWORD_HASHER = PasswordHasher()


def hash_password(password: str) -> str:
    """Return an Argon2id hash of ``password``."""
    return _PASSWORD_HASHER.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """Return True when ``password`` matches ``password_hash``."""
    try:
        return _PASSWORD_HASHER.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def new_refresh_token() -> str:
    """Generate a high-entropy opaque refresh token (raw; return once)."""
    return secrets.token_urlsafe(32)


def hash_refresh_token(raw_token: str) -> str:
    """SHA-256 hex digest of a refresh token for storage."""
    return hashlib.sha256(raw_token.encode('utf-8')).hexdigest()


def issue_access_token(
    *,
    settings: Settings,
    identity_id: uuid.UUID,
    session_id: uuid.UUID,
) -> tuple[str, int]:
    """Return ``(jwt, expires_in_seconds)`` for the given identity/session."""
    now = datetime.now(UTC)
    expires_in = settings.access_token_ttl_seconds
    payload: dict[str, Any] = {
        'sub': str(identity_id),
        'sid': str(session_id),
        'iat': now,
        'exp': now + timedelta(seconds=expires_in),
    }
    token = jwt.encode(
        payload,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return token, expires_in


def decode_access_token(settings: Settings, token: str) -> dict[str, Any]:
    """Decode and validate an access JWT. Raises ``jwt.PyJWTError`` on failure."""
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )


def normalize_email(email: str) -> str:
    """Normalize email for storage and lookup (trim + lowercase)."""
    return email.strip().lower()
