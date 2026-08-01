"""Auth + Users tables for password auth (P1.1).

Revision ID: a1b2c3d4e5f6
Revises: 3bf7446b0701
Create Date: 2026-08-01 18:30:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: str | Sequence[str] | None = '3bf7446b0701'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create identities, credentials, refresh_sessions, and users."""
    op.create_table(
        'identities',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column(
            'status',
            sa.String(length=32),
            server_default='active',
            nullable=False,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_identities')),
        sa.UniqueConstraint('email', name='uq_identities_email'),
    )

    op.create_table(
        'identity_credentials',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('identity_id', sa.Uuid(), nullable=False),
        sa.Column('provider', sa.String(length=64), nullable=False),
        sa.Column('subject', sa.String(length=320), nullable=False),
        sa.Column('secret_hash', sa.Text(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['identity_id'],
            ['identities.id'],
            name=op.f('fk_identity_credentials_identity_id_identities'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_identity_credentials')),
        sa.UniqueConstraint(
            'identity_id',
            'provider',
            name='uq_identity_credentials_identity_provider',
        ),
        sa.UniqueConstraint(
            'provider',
            'subject',
            name='uq_identity_credentials_provider_subject',
        ),
    )
    op.create_index(
        op.f('ix_identity_credentials_identity_id'),
        'identity_credentials',
        ['identity_id'],
        unique=False,
    )

    op.create_table(
        'refresh_sessions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('identity_id', sa.Uuid(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('family_id', sa.Uuid(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rotated_from_id', sa.Uuid(), nullable=True),
        sa.Column('user_agent', sa.String(length=512), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ['identity_id'],
            ['identities.id'],
            name=op.f('fk_refresh_sessions_identity_id_identities'),
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['rotated_from_id'],
            ['refresh_sessions.id'],
            name=op.f('fk_refresh_sessions_rotated_from_id_refresh_sessions'),
            ondelete='SET NULL',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_refresh_sessions')),
        sa.UniqueConstraint(
            'token_hash',
            name='uq_refresh_sessions_token_hash',
        ),
    )
    op.create_index(
        op.f('ix_refresh_sessions_family_id'),
        'refresh_sessions',
        ['family_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_refresh_sessions_identity_id'),
        'refresh_sessions',
        ['identity_id'],
        unique=False,
    )

    op.create_table(
        'users',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('identity_id', sa.Uuid(), nullable=False),
        sa.Column('username', sa.String(length=64), nullable=True),
        sa.Column('display_name', sa.String(length=120), nullable=True),
        sa.Column('bio', sa.Text(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ['identity_id'],
            ['identities.id'],
            name=op.f('fk_users_identity_id_identities'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
        sa.UniqueConstraint('identity_id', name='uq_users_identity_id'),
        sa.UniqueConstraint('username', name='uq_users_username'),
    )


def downgrade() -> None:
    """Drop Auth + Users tables."""
    op.drop_table('users')
    op.drop_index(
        op.f('ix_refresh_sessions_identity_id'),
        table_name='refresh_sessions',
    )
    op.drop_index(
        op.f('ix_refresh_sessions_family_id'),
        table_name='refresh_sessions',
    )
    op.drop_table('refresh_sessions')
    op.drop_index(
        op.f('ix_identity_credentials_identity_id'),
        table_name='identity_credentials',
    )
    op.drop_table('identity_credentials')
    op.drop_table('identities')
