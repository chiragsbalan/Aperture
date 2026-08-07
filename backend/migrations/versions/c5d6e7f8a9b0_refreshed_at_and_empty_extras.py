"""Add refreshed_at; clear remaining title-chrome extras (Option B).

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-08-07 12:30:00.000000

- ``content_items.refreshed_at`` for TMDb ≤6‑month lean-stub refresh.
- Backfill ``refreshed_at`` from ``updated_at``.
- Set ``extras`` to ``{}`` (meta tabs / providers / similar are enrichment-only).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'c5d6e7f8a9b0'
down_revision: str | Sequence[str] | None = 'b4c5d6e7f8a9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add refreshed_at and empty durable extras."""
    op.add_column(
        'content_items',
        sa.Column('refreshed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        """
        UPDATE content_items
        SET refreshed_at = updated_at
        WHERE refreshed_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE content_items
        SET extras = '{}'::jsonb
        WHERE extras <> '{}'::jsonb
        """
    )


def downgrade() -> None:
    """Drop refreshed_at; cannot restore trimmed extras."""
    op.drop_column('content_items', 'refreshed_at')
