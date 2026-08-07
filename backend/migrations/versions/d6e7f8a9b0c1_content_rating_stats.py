"""Add content_rating_stats for community title averages.

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-08-08 02:30:00.000000

Aggregate of latest non-null diary rating per user per title.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'd6e7f8a9b0c1'
down_revision: str | Sequence[str] | None = 'c5d6e7f8a9b0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create content_rating_stats."""
    op.create_table(
        'content_rating_stats',
        sa.Column('content_type', sa.String(length=32), nullable=False),
        sa.Column('content_id', sa.Uuid(), nullable=False),
        sa.Column('rating_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column(
            'rating_sum',
            sa.Numeric(precision=12, scale=1),
            nullable=False,
            server_default='0',
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.CheckConstraint(
            "content_type IN ('movie', 'tv_show')",
            name='content_rating_stats_content_type',
        ),
        sa.CheckConstraint(
            'rating_count >= 0',
            name='content_rating_stats_rating_count_nonneg',
        ),
        sa.PrimaryKeyConstraint('content_type', 'content_id'),
    )


def downgrade() -> None:
    """Drop content_rating_stats."""
    op.drop_table('content_rating_stats')
