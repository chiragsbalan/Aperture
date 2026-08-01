"""Auth domain service: register, login, logout, refresh, me."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import rate_limit as auth_rate_limit
from app.auth import repository as auth_repository
from app.auth.models import Identity, RefreshSession
from app.auth.security import (
    decode_access_token,
    hash_password,
    hash_refresh_token,
    issue_access_token,
    new_refresh_token,
    normalize_email,
    verify_password_or_dummy,
)
from app.core.cache import CacheBackend, get_cache
from app.core.config import Settings
from app.core.ids import new_uuid7
from app.users import service as users_service
from app.users.service import UserProfile

_INVALID_CREDENTIALS = 'Invalid credentials'
_INVALID_REFRESH = 'Invalid refresh token'


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


def _grace_cache_key(token_hash: str) -> str:
    return f'auth:refresh_grace:{token_hash}'


def _tokens_to_cache(tokens: IssuedTokens) -> str:
    return json.dumps(
        {
            'access_token': tokens.access_token,
            'refresh_token': tokens.refresh_token,
            'expires_in': tokens.expires_in,
        }
    )


def _tokens_from_cache(raw: str) -> IssuedTokens | None:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    access = data.get('access_token')
    refresh = data.get('refresh_token')
    expires_in = data.get('expires_in')
    if (
        not isinstance(access, str)
        or not isinstance(refresh, str)
        or not isinstance(expires_in, int)
    ):
        return None
    return IssuedTokens(
        access_token=access,
        refresh_token=refresh,
        expires_in=expires_in,
    )


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
    client_ip: str | None = None,
) -> IssuedTokens:
    """Create identity + password credential + user profile; return tokens."""
    await auth_rate_limit.enforce_register_limits(
        session,
        settings=settings,
        email=email,
        client_ip=client_ip,
    )
    normalized = normalize_email(email)
    existing = await auth_repository.get_identity_by_email(session, normalized)
    if existing is not None:
        await auth_rate_limit.record_register_failure(
            session,
            settings=settings,
            email=normalized,
            client_ip=client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Email already registered',
        )
    taken = await users_service.get_identity_id_by_username(
        session,
        username=username,
    )
    if taken is not None:
        await auth_rate_limit.record_register_failure(
            session,
            settings=settings,
            email=normalized,
            client_ip=client_ip,
        )
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
        await auth_rate_limit.record_register_failure(
            session,
            settings=settings,
            email=normalized,
            client_ip=client_ip,
        )
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
    client_ip: str | None = None,
) -> IssuedTokens:
    """Verify password for email or username and issue a new token pair."""
    await auth_rate_limit.enforce_login_limits(
        session,
        settings=settings,
        identifier=identifier,
        client_ip=client_ip,
    )

    identity = await _resolve_identity_for_login(session, identifier)
    password_hash: str | None = None
    if identity is not None and identity.status == 'active':
        credential = await auth_repository.get_password_credential(
            session,
            identity.id,
        )
        if credential is not None:
            password_hash = credential.secret_hash

    if identity is None or identity.status != 'active' or password_hash is None:
        verify_password_or_dummy(None, password)
        await auth_rate_limit.record_login_failure(
            session,
            settings=settings,
            identifier=identifier,
            client_ip=client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_INVALID_CREDENTIALS,
        )

    if not verify_password_or_dummy(password_hash, password):
        await auth_rate_limit.record_login_failure(
            session,
            settings=settings,
            identifier=identifier,
            client_ip=client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_INVALID_CREDENTIALS,
        )

    await auth_rate_limit.clear_login_failures(
        session,
        identifier=identifier,
        client_ip=client_ip,
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


async def _store_grace_tokens(
    session: AsyncSession,
    cache: CacheBackend,
    *,
    settings: Settings,
    old_token_hash: str,
    tokens: IssuedTokens,
    now: datetime,
) -> None:
    """Write durable + L1 grace payloads (caller commits the DB txn)."""
    grace_expires = now + timedelta(seconds=settings.refresh_reuse_grace_seconds)
    await auth_repository.upsert_refresh_grace_payload(
        session,
        token_hash=old_token_hash,
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        expires_in=tokens.expires_in,
        expires_at=grace_expires,
        created_at=now,
    )
    await cache.set(
        _grace_cache_key(old_token_hash),
        _tokens_to_cache(tokens),
        ttl_seconds=settings.refresh_reuse_grace_seconds,
    )


async def _load_grace_tokens(
    session: AsyncSession,
    cache: CacheBackend,
    *,
    token_hash: str,
    now: datetime,
) -> IssuedTokens | None:
    cached = await cache.get(_grace_cache_key(token_hash))
    if cached is not None:
        tokens = _tokens_from_cache(cached)
        if tokens is not None:
            return tokens
    row = await auth_repository.get_refresh_grace_payload(
        session,
        token_hash=token_hash,
        now=now,
    )
    if row is None:
        return None
    return IssuedTokens(
        access_token=row.access_token,
        refresh_token=row.refresh_token,
        expires_in=row.expires_in,
    )


async def _rotate_claimed_session(
    session: AsyncSession,
    *,
    settings: Settings,
    cache: CacheBackend,
    claimed: RefreshSession,
    old_token_hash: str,
    user_agent: str | None,
    now: datetime,
) -> IssuedTokens:
    identity = await auth_repository.get_identity_by_id(session, claimed.identity_id)
    if identity is None or identity.status != 'active':
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_INVALID_REFRESH,
        )

    tokens = await _issue_token_pair(
        session,
        settings=settings,
        identity_id=identity.id,
        family_id=claimed.family_id,
        rotated_from_id=claimed.id,
        user_agent=user_agent,
    )
    await _store_grace_tokens(
        session,
        cache,
        settings=settings,
        old_token_hash=old_token_hash,
        tokens=tokens,
        now=now,
    )
    await session.commit()
    return tokens


async def _handle_refresh_reuse(
    session: AsyncSession,
    *,
    settings: Settings,
    cache: CacheBackend,
    token_hash: str,
    now: datetime,
) -> IssuedTokens:
    """Grace reuse or family revoke when a rotated/revoked token is presented."""
    row = await auth_repository.get_refresh_session_by_token_hash(session, token_hash)
    if row is None or row.revoked_at is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_INVALID_REFRESH,
        )

    successor = await auth_repository.get_refresh_session_by_rotated_from_id(
        session,
        row.id,
    )
    # Logout (or incomplete rotation): revoked with no successor → plain 401.
    if successor is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_INVALID_REFRESH,
        )

    grace = timedelta(seconds=settings.refresh_reuse_grace_seconds)
    within_grace = now - row.revoked_at <= grace
    if within_grace:
        tokens = await _load_grace_tokens(
            session,
            cache,
            token_hash=token_hash,
            now=now,
        )
        if tokens is not None:
            return tokens
        # Within grace but no durable/L1 payload → 401, no family revoke.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_INVALID_REFRESH,
        )

    await auth_repository.revoke_refresh_family(
        session,
        row.family_id,
        revoked_at=now,
    )
    await session.commit()
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=_INVALID_REFRESH,
    )


async def refresh(
    session: AsyncSession,
    *,
    settings: Settings,
    refresh_token: str,
    user_agent: str | None = None,
    client_ip: str | None = None,
    cache: CacheBackend | None = None,
) -> IssuedTokens:
    """Rotate refresh token; honor 10s reuse grace; revoke family outside grace."""
    cache_backend = cache if cache is not None else get_cache()
    await auth_rate_limit.enforce_refresh_limits(
        session,
        settings=settings,
        client_ip=client_ip,
    )

    token_hash = hash_refresh_token(refresh_token)
    now = datetime.now(UTC)
    try:
        claimed = await auth_repository.claim_refresh_session_for_rotation(
            session,
            token_hash=token_hash,
            revoked_at=now,
        )
        if claimed is None:
            return await _handle_refresh_reuse(
                session,
                settings=settings,
                cache=cache_backend,
                token_hash=token_hash,
                now=now,
            )

        return await _rotate_claimed_session(
            session,
            settings=settings,
            cache=cache_backend,
            claimed=claimed,
            old_token_hash=token_hash,
            user_agent=user_agent,
            now=now,
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            await session.rollback()
            await auth_rate_limit.record_refresh_attempt(
                session,
                settings=settings,
                client_ip=client_ip,
            )
        raise
    except Exception:
        await session.rollback()
        raise


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
