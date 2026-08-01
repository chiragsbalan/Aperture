"""Persistence for Auth domain."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import case, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import (
    AuthFailedAttempt,
    Identity,
    IdentityCredential,
    RefreshGracePayload,
    RefreshSession,
)
from app.core.ids import new_uuid7

PASSWORD_PROVIDER = 'password'
GOOGLE_PROVIDER = 'google'


async def get_identity_by_email(
    session: AsyncSession,
    email: str,
) -> Identity | None:
    """Return a non-deleted identity for ``email``, if any."""
    result = await session.execute(
        select(Identity).where(
            Identity.email == email,
            Identity.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_identity_by_id(
    session: AsyncSession,
    identity_id: uuid.UUID,
) -> Identity | None:
    """Return a non-deleted identity by primary key."""
    result = await session.execute(
        select(Identity).where(
            Identity.id == identity_id,
            Identity.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def create_identity(
    session: AsyncSession,
    *,
    email: str,
) -> Identity:
    """Insert an active identity."""
    identity = Identity(email=email, status='active')
    session.add(identity)
    await session.flush()
    return identity


async def create_password_credential(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    email: str,
    password_hash: str,
) -> IdentityCredential:
    """Attach a password credential to ``identity_id``."""
    credential = IdentityCredential(
        identity_id=identity_id,
        provider=PASSWORD_PROVIDER,
        subject=email,
        secret_hash=password_hash,
    )
    session.add(credential)
    await session.flush()
    return credential


async def get_password_credential(
    session: AsyncSession,
    identity_id: uuid.UUID,
) -> IdentityCredential | None:
    """Return the password credential for ``identity_id``, if any."""
    result = await session.execute(
        select(IdentityCredential).where(
            IdentityCredential.identity_id == identity_id,
            IdentityCredential.provider == PASSWORD_PROVIDER,
        )
    )
    return result.scalar_one_or_none()


async def get_credential_by_provider_subject(
    session: AsyncSession,
    *,
    provider: str,
    subject: str,
) -> IdentityCredential | None:
    """Return a credential for ``provider`` + ``subject``, if any."""
    result = await session.execute(
        select(IdentityCredential).where(
            IdentityCredential.provider == provider,
            IdentityCredential.subject == subject,
        )
    )
    return result.scalar_one_or_none()


async def get_oauth_credential(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    provider: str,
) -> IdentityCredential | None:
    """Return the OAuth credential for ``identity_id`` + ``provider``, if any."""
    result = await session.execute(
        select(IdentityCredential).where(
            IdentityCredential.identity_id == identity_id,
            IdentityCredential.provider == provider,
        )
    )
    return result.scalar_one_or_none()


async def create_oauth_credential(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    provider: str,
    subject: str,
) -> IdentityCredential:
    """Attach an OAuth provider subject to ``identity_id``."""
    credential = IdentityCredential(
        identity_id=identity_id,
        provider=provider,
        subject=subject,
        secret_hash=None,
    )
    session.add(credential)
    await session.flush()
    return credential


async def list_providers_for_identity(
    session: AsyncSession,
    identity_id: uuid.UUID,
) -> list[str]:
    """Return credential provider names for ``identity_id`` (stable order)."""
    result = await session.execute(
        select(IdentityCredential.provider).where(
            IdentityCredential.identity_id == identity_id,
        )
    )
    providers = list(result.scalars().all())
    order = {PASSWORD_PROVIDER: 0, GOOGLE_PROVIDER: 1}
    providers.sort(key=lambda name: order.get(name, 99))
    return providers


async def create_refresh_session(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    token_hash: str,
    family_id: uuid.UUID,
    expires_at: datetime,
    rotated_from_id: uuid.UUID | None = None,
    user_agent: str | None = None,
) -> RefreshSession:
    """Persist a new refresh session row."""
    row = RefreshSession(
        identity_id=identity_id,
        token_hash=token_hash,
        family_id=family_id,
        expires_at=expires_at,
        rotated_from_id=rotated_from_id,
        user_agent=user_agent,
    )
    session.add(row)
    await session.flush()
    return row


async def get_refresh_session_by_token_hash(
    session: AsyncSession,
    token_hash: str,
) -> RefreshSession | None:
    """Look up a refresh session by hashed token."""
    result = await session.execute(
        select(RefreshSession).where(RefreshSession.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def get_refresh_session_by_id(
    session: AsyncSession,
    session_id: uuid.UUID,
) -> RefreshSession | None:
    """Look up a refresh session by primary key."""
    result = await session.execute(
        select(RefreshSession).where(RefreshSession.id == session_id)
    )
    return result.scalar_one_or_none()


async def claim_refresh_session_for_rotation(
    session: AsyncSession,
    *,
    token_hash: str,
    revoked_at: datetime,
) -> RefreshSession | None:
    """Atomically claim an unrevoked, unexpired session for rotation.

    Uses ``UPDATE … RETURNING`` so only one concurrent caller wins the row.
    Returns ``None`` when no matching claimable session exists.
    """
    result = await session.execute(
        update(RefreshSession)
        .where(
            RefreshSession.token_hash == token_hash,
            RefreshSession.revoked_at.is_(None),
            RefreshSession.expires_at > revoked_at,
        )
        .values(revoked_at=revoked_at)
        .returning(RefreshSession)
    )
    return result.scalar_one_or_none()


async def revoke_refresh_session(
    session: AsyncSession,
    session_id: uuid.UUID,
    *,
    revoked_at: datetime,
) -> None:
    """Mark a single refresh session revoked."""
    await session.execute(
        update(RefreshSession)
        .where(
            RefreshSession.id == session_id,
            RefreshSession.revoked_at.is_(None),
        )
        .values(revoked_at=revoked_at)
    )


async def get_refresh_session_by_rotated_from_id(
    session: AsyncSession,
    rotated_from_id: uuid.UUID,
) -> RefreshSession | None:
    """Return the successor session created by rotating ``rotated_from_id``."""
    result = await session.execute(
        select(RefreshSession).where(
            RefreshSession.rotated_from_id == rotated_from_id,
        )
    )
    return result.scalar_one_or_none()


async def revoke_refresh_family(
    session: AsyncSession,
    family_id: uuid.UUID,
    *,
    revoked_at: datetime,
) -> None:
    """Revoke all unrevoked sessions in a refresh family (theft response)."""
    await session.execute(
        update(RefreshSession)
        .where(
            RefreshSession.family_id == family_id,
            RefreshSession.revoked_at.is_(None),
        )
        .values(revoked_at=revoked_at)
    )


async def upsert_refresh_grace_payload(
    session: AsyncSession,
    *,
    token_hash: str,
    access_token: str,
    refresh_token: str,
    expires_in: int,
    expires_at: datetime,
    created_at: datetime,
) -> None:
    """Persist successor tokens for grace reuse (same txn as rotation)."""
    stmt = pg_insert(RefreshGracePayload).values(
        token_hash=token_hash,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        expires_at=expires_at,
        created_at=created_at,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[RefreshGracePayload.token_hash],
        set_={
            'access_token': stmt.excluded.access_token,
            'refresh_token': stmt.excluded.refresh_token,
            'expires_in': stmt.excluded.expires_in,
            'expires_at': stmt.excluded.expires_at,
            'created_at': stmt.excluded.created_at,
        },
    )
    await session.execute(stmt)


async def get_refresh_grace_payload(
    session: AsyncSession,
    *,
    token_hash: str,
    now: datetime,
) -> RefreshGracePayload | None:
    """Return an unexpired grace payload for ``token_hash``, if any."""
    result = await session.execute(
        select(RefreshGracePayload).where(
            RefreshGracePayload.token_hash == token_hash,
            RefreshGracePayload.expires_at > now,
        )
    )
    return result.scalar_one_or_none()


async def get_failed_attempt(
    session: AsyncSession,
    *,
    action: str,
    subject_key: str,
) -> AuthFailedAttempt | None:
    """Look up a durable failure counter row."""
    result = await session.execute(
        select(AuthFailedAttempt).where(
            AuthFailedAttempt.action == action,
            AuthFailedAttempt.subject_key == subject_key,
        )
    )
    return result.scalar_one_or_none()


async def upsert_failed_attempt(
    session: AsyncSession,
    *,
    action: str,
    subject_key: str,
    window_started_at: datetime,
    window_seconds: int,
) -> None:
    """Atomically insert or increment a failure counter (SQL-side +1 / reset)."""
    stmt = pg_insert(AuthFailedAttempt).values(
        id=new_uuid7(),
        action=action,
        subject_key=subject_key,
        window_started_at=window_started_at,
        attempt_count=1,
    )
    window_expired = (
        window_started_at - AuthFailedAttempt.window_started_at
        >= timedelta(seconds=window_seconds)
    )
    stmt = stmt.on_conflict_do_update(
        constraint='uq_auth_failed_attempts_action_subject',
        set_={
            'attempt_count': case(
                (window_expired, 1),
                else_=AuthFailedAttempt.attempt_count + 1,
            ),
            'window_started_at': case(
                (window_expired, window_started_at),
                else_=AuthFailedAttempt.window_started_at,
            ),
            'updated_at': func.now(),
        },
    )
    await session.execute(stmt)


async def clear_failed_attempt(
    session: AsyncSession,
    *,
    action: str,
    subject_key: str,
) -> None:
    """Delete a failure counter row if present."""
    row = await get_failed_attempt(
        session,
        action=action,
        subject_key=subject_key,
    )
    if row is not None:
        await session.delete(row)
        await session.flush()
