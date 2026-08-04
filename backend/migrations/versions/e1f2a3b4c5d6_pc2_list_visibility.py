"""pc.2: always-public watchlist, always-private favorites, unlisted customs.

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-08-04 01:20:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: str | Sequence[str] | None = 'd0e1f2a3b4c5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Force system-list visibility; re-allow unlisted on custom lists."""
    # 1) Data fixes before widening CHECK.
    op.execute("UPDATE lists SET visibility = 'public' WHERE kind = 'watchlist'")
    op.execute("UPDATE lists SET visibility = 'private' WHERE kind = 'favorites'")

    # 2) Expand visibility CHECK (custom lists may be unlisted again).
    op.drop_constraint(op.f('ck_lists_visibility'), 'lists', type_='check')
    op.create_check_constraint(
        op.f('ck_lists_visibility'),
        'lists',
        "visibility IN ('private', 'public', 'unlisted')",
    )

    # 3) Kind-scoped visibility invariants.
    op.create_check_constraint(
        'ck_lists_watchlist_public',
        'lists',
        "(kind <> 'watchlist') OR (visibility = 'public')",
    )
    op.create_check_constraint(
        'ck_lists_favorites_private',
        'lists',
        "(kind <> 'favorites') OR (visibility = 'private')",
    )


def downgrade() -> None:
    """Drop kind CHECKs; collapse unlisted→private; restore binary CHECK."""
    op.drop_constraint('ck_lists_favorites_private', 'lists', type_='check')
    op.drop_constraint('ck_lists_watchlist_public', 'lists', type_='check')

    op.execute("UPDATE lists SET visibility = 'private' WHERE visibility = 'unlisted'")
    op.drop_constraint(op.f('ck_lists_visibility'), 'lists', type_='check')
    op.create_check_constraint(
        op.f('ck_lists_visibility'),
        'lists',
        "visibility IN ('private', 'public')",
    )
