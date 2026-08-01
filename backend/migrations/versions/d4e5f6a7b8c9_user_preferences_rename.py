"""User preferences JSONB and username rename cooldown.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-01 21:55:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: str | Sequence[str] | None = 'c3d4e5f6a7b8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DEFAULT_PREFERENCES = '{"theme": "system", "spoilers": "show", "language": "en"}'


def upgrade() -> None:
    """Add preferences and username_changed_at for P1.4 profile settings."""
    op.add_column(
        'users',
        sa.Column(
            'preferences',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text(f"'{_DEFAULT_PREFERENCES}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        'users',
        sa.Column(
            'username_changed_at',
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Drop P1.4 profile columns."""
    op.drop_column('users', 'username_changed_at')
    op.drop_column('users', 'preferences')
