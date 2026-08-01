"""Auth ORM models: identities, credentials, refresh sessions."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins import SoftDeleteMixin, TimestampMixin, UuidPrimaryKeyMixin


class Identity(UuidPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Core login identity (email). Profile lives in Users."""

    __tablename__ = 'identities'

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default='active',
        server_default='active',
    )

    __table_args__ = (UniqueConstraint('email', name='uq_identities_email'),)

    credentials: Mapped[list[IdentityCredential]] = relationship(
        back_populates='identity',
        cascade='all, delete-orphan',
    )
    refresh_sessions: Mapped[list[RefreshSession]] = relationship(
        back_populates='identity',
        cascade='all, delete-orphan',
    )


class IdentityCredential(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Password hash and/or OAuth provider subject for an identity."""

    __tablename__ = 'identity_credentials'

    identity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('identities.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    # OAuth subject, or normalized email for password credentials.
    subject: Mapped[str] = mapped_column(String(320), nullable=False)
    secret_hash: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            'provider',
            'subject',
            name='uq_identity_credentials_provider_subject',
        ),
        UniqueConstraint(
            'identity_id',
            'provider',
            name='uq_identity_credentials_identity_provider',
        ),
    )

    identity: Mapped[Identity] = relationship(back_populates='credentials')


class RefreshSession(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Opaque refresh token session (raw token never stored)."""

    __tablename__ = 'refresh_sessions'

    identity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('identities.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    family_id: Mapped[uuid.UUID] = mapped_column(Uuid(), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    rotated_from_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey('refresh_sessions.id', ondelete='SET NULL'),
        nullable=True,
    )
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)

    __table_args__ = (
        UniqueConstraint('token_hash', name='uq_refresh_sessions_token_hash'),
    )

    identity: Mapped[Identity] = relationship(back_populates='refresh_sessions')


class AuthFailedAttempt(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Durable per-subject failure counters for auth rate limits (P1.2)."""

    __tablename__ = 'auth_failed_attempts'

    # login | register | refresh
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    # Privacy-preserving key, e.g. ``id:<sha256>`` or ``ip:<sha256>``.
    subject_key: Mapped[str] = mapped_column(String(80), nullable=False)
    window_started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    attempt_count: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint(
            'action',
            'subject_key',
            name='uq_auth_failed_attempts_action_subject',
        ),
    )


class RefreshGracePayload(Base):
    """Durable successor token pair for the refresh reuse grace window."""

    __tablename__ = 'refresh_grace_payloads'

    # Hash of the *rotated* (old) refresh token presented during grace reuse.
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    access_token: Mapped[str] = mapped_column(Text(), nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text(), nullable=False)
    expires_in: Mapped[int] = mapped_column(Integer(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
