"""Auth failed-attempt counters for rate limits (P1.2).

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-01 19:30:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: str | Sequence[str] | None = 'a1b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create durable auth failure counters."""
    op.create_table(
        'auth_failed_attempts',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('action', sa.String(length=32), nullable=False),
        sa.Column('subject_key', sa.String(length=80), nullable=False),
        sa.Column('window_started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempt_count', sa.Integer(), nullable=False),
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
        sa.PrimaryKeyConstraint('id', name=op.f('pk_auth_failed_attempts')),
        sa.UniqueConstraint(
            'action',
            'subject_key',
            name='uq_auth_failed_attempts_action_subject',
        ),
    )


def downgrade() -> None:
    """Drop auth failure counters."""
    op.drop_table('auth_failed_attempts')
