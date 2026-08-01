"""Auth domain service: register, login, logout, refresh, me."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import repository as auth_repository
from app.auth.models import Identity
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
from app.core.ids import new_uuid7
from app.users import service as users_service
from app.users.service import UserProfile


@dataclass(frozen=True, slots=True)
class IssuedTokens:
    """Access + refresh pair issued to the BFF."""

    access_token: str
    refresh_token: str
    expires_in: int


@dataclass(frozen=True, slots=True)
class AuthContext:
    """Authenticated identity with optional profile."""

    identity: Identity
    user: UserProfile | None


async def _issue_token_pair(
    session: AsyncSession,
    *,
    settings: Settings,
    identity_id: uuid.UUID,
    family_id: uuid.UUID | None = None,
    rotated_from_id: uuid.UUID | None = None,
    user_agent: str | None = None,
) -> IssuedTokens:
    raw_refresh = new_refresh_token()
    token_hash = hash_refresh_token(raw_refresh)
    now = datetime.now(UTC)
    expires_at = now + timedelta(seconds=settings.refresh_token_ttl_seconds)
    family = family_id if family_id is not None else new_uuid7()

    refresh_row = await auth_repository.create_refresh_session(
        session,
        identity_id=identity_id,
        token_hash=token_hash,
        family_id=family,
        expires_at=expires_at,
        rotated_from_id=rotated_from_id,
        user_agent=user_agent,
    )
    access_token, expires_in = issue_access_token(
        settings=settings,
        identity_id=identity_id,
        session_id=refresh_row.id,
    )
    return IssuedTokens(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=expires_in,
    )


async def register(
    session: AsyncSession,
    *,
    settings: Settings,
    email: str,
    username: str,
    password: str,
    user_agent: str | None = None,
) -> IssuedTokens:
    """Create identity + password credential + user profile; return tokens."""
    normalized = normalize_email(email)
    existing = await auth_repository.get_identity_by_email(session, normalized)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Email already registered',
        )
    taken = await users_service.get_identity_id_by_username(
        session,
        username=username,
    )
    if taken is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Username already taken',
        )

    try:
        identity = await auth_repository.create_identity(session, email=normalized)
        await auth_repository.create_password_credential(
            session,
            identity_id=identity.id,
            email=normalized,
            password_hash=hash_password(password),
        )
        await users_service.create_profile_for_identity(
            session,
            identity_id=identity.id,
            username=username,
        )
        tokens = await _issue_token_pair(
            session,
            settings=settings,
            identity_id=identity.id,
            user_agent=user_agent,
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        detail = 'Email already registered'
        message = str(getattr(exc, 'orig', exc)).lower()
        if 'username' in message or 'uq_users_username' in message:
            detail = 'Username already taken'
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        ) from exc
    return tokens


async def _resolve_identity_for_login(
    session: AsyncSession,
    identifier: str,
) -> Identity | None:
    """Resolve an active identity from email or username."""
    if '@' in identifier:
        return await auth_repository.get_identity_by_email(
            session,
            normalize_email(identifier),
        )

    identity_id = await users_service.get_identity_id_by_username(
        session,
        username=identifier,
    )
    if identity_id is None:
        return None
    return await auth_repository.get_identity_by_id(session, identity_id)


async def login(
    session: AsyncSession,
    *,
    settings: Settings,
    identifier: str,
    password: str,
    user_agent: str | None = None,
) -> IssuedTokens:
    """Verify password for email or username and issue a new token pair."""
    identity = await _resolve_identity_for_login(session, identifier)
    if identity is None or identity.status != 'active':
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid credentials',
        )

    credential = await auth_repository.get_password_credential(session, identity.id)
    if credential is None or credential.secret_hash is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid credentials',
        )
    if not verify_password(credential.secret_hash, password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid credentials',
        )

    tokens = await _issue_token_pair(
        session,
        settings=settings,
        identity_id=identity.id,
        user_agent=user_agent,
    )
    await session.commit()
    return tokens


async def logout(
    session: AsyncSession,
    *,
    refresh_token: str,
) -> None:
    """Revoke the refresh session matching ``refresh_token`` (idempotent)."""
    token_hash = hash_refresh_token(refresh_token)
    row = await auth_repository.get_refresh_session_by_token_hash(session, token_hash)
    if row is not None and row.revoked_at is None:
        await auth_repository.revoke_refresh_session(
            session,
            row.id,
            revoked_at=datetime.now(UTC),
        )
        await session.commit()


async def refresh(
    session: AsyncSession,
    *,
    settings: Settings,
    refresh_token: str,
    user_agent: str | None = None,
) -> IssuedTokens:
    """Atomically rotate refresh token and issue a new access token.

    Claim (UPDATE…RETURNING) → validate identity → mint successor → one commit.
    Zero claimable rows → 401. Any failure after claim rolls back so revoke is
    not durable without a successor.
    """
    token_hash = hash_refresh_token(refresh_token)
    now = datetime.now(UTC)
    row = await auth_repository.claim_refresh_session_for_rotation(
        session,
        token_hash=token_hash,
        revoked_at=now,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid refresh token',
        )

    try:
        identity = await auth_repository.get_identity_by_id(session, row.identity_id)
        if identity is None or identity.status != 'active':
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Invalid refresh token',
            )

        tokens = await _issue_token_pair(
            session,
            settings=settings,
            identity_id=identity.id,
            family_id=row.family_id,
            rotated_from_id=row.id,
            user_agent=user_agent,
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return tokens


async def get_me(
    session: AsyncSession,
    *,
    identity: Identity,
) -> AuthContext:
    """Load profile summary for the authenticated identity."""
    user = await users_service.get_profile_for_identity(
        session,
        identity_id=identity.id,
    )
    return AuthContext(identity=identity, user=user)


async def resolve_identity_from_access_token(
    session: AsyncSession,
    *,
    settings: Settings,
    token: str,
) -> Identity:
    """Validate access JWT (including sid session binding) and return identity."""
    try:
        payload = decode_access_token(settings, token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid access token',
        ) from exc

    sub = payload.get('sub')
    sid = payload.get('sid')
    if not isinstance(sub, str) or not isinstance(sid, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid access token',
        )
    try:
        identity_id = uuid.UUID(sub)
        session_id = uuid.UUID(sid)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid access token',
        ) from exc

    refresh_row = await auth_repository.get_refresh_session_by_id(session, session_id)
    now = datetime.now(UTC)
    if (
        refresh_row is None
        or refresh_row.revoked_at is not None
        or refresh_row.expires_at <= now
        or refresh_row.identity_id != identity_id
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid access token',
        )

    identity = await auth_repository.get_identity_by_id(session, identity_id)
    if identity is None or identity.status != 'active':
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid access token',
        )
    return identity
