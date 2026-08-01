"""Persistence for Auth domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Identity, IdentityCredential, RefreshSession

PASSWORD_PROVIDER = 'password'


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
