"""pc.2: binary list visibility + optional diary half-star rating.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-08-05 01:15:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'f2a3b4c5d6e7'
down_revision: str | Sequence[str] | None = 'e1f2a3b4c5d6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Drop unlisted; add nullable watch_entries.rating (half-stars 0.5–5.0)."""
    # e1f2a3b4c5d6 re-opened unlisted for custom lists; pc.2 product is binary.
    op.execute("UPDATE lists SET visibility = 'private' WHERE visibility = 'unlisted'")
    op.drop_constraint(op.f('ck_lists_visibility'), 'lists', type_='check')
    op.create_check_constraint(
        op.f('ck_lists_visibility'),
        'lists',
        "visibility IN ('private', 'public')",
    )

    op.add_column(
        'watch_entries',
        sa.Column('rating', sa.Numeric(2, 1), nullable=True),
    )
    op.create_check_constraint(
        'rating_half_stars',
        'watch_entries',
        'rating IS NULL OR (rating >= 0.5 AND rating <= 5.0 '
        'AND (rating * 2) = TRUNC(rating * 2))',
    )


def downgrade() -> None:
    """Drop rating; restore unlisted on custom lists (e1f2 state)."""
    op.drop_constraint('rating_half_stars', 'watch_entries', type_='check')
    op.drop_column('watch_entries', 'rating')

    op.drop_constraint(op.f('ck_lists_visibility'), 'lists', type_='check')
    op.create_check_constraint(
        op.f('ck_lists_visibility'),
        'lists',
        "visibility IN ('private', 'public', 'unlisted')",
    )
