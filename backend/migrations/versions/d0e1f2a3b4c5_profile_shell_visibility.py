"""Profile shell fields + lists visibility public|private only (pc.1).

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-08-03 18:45:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd0e1f2a3b4c5'
down_revision: str | Sequence[str] | None = 'c9d0e1f2a3b4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add profile URLs/links; migrate unlisted→private; tighten CHECK."""
    op.add_column(
        'users',
        sa.Column('avatar_url', sa.String(length=512), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('website_url', sa.String(length=512), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column(
            'links',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    op.execute("UPDATE lists SET visibility = 'private' WHERE visibility = 'unlisted'")
    op.drop_constraint(op.f('ck_lists_visibility'), 'lists', type_='check')
    op.create_check_constraint(
        op.f('ck_lists_visibility'),
        'lists',
        "visibility IN ('private', 'public')",
    )


def downgrade() -> None:
    """Restore tristate visibility; drop profile shell columns."""
    op.drop_constraint(op.f('ck_lists_visibility'), 'lists', type_='check')
    op.create_check_constraint(
        op.f('ck_lists_visibility'),
        'lists',
        "visibility IN ('private', 'public', 'unlisted')",
    )
    op.drop_column('users', 'links')
    op.drop_column('users', 'website_url')
    op.drop_column('users', 'avatar_url')
