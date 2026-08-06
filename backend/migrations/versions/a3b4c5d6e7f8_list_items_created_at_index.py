"""Index list_items for newest-added-first shelf browsing.

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-08-06 12:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = 'a3b4c5d6e7f8'
down_revision: str | Sequence[str] | None = 'f2a3b4c5d6e7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add (list_id, created_at DESC, id DESC) for shelf pagination."""
    op.create_index(
        'ix_list_items_list_id_created_at',
        'list_items',
        ['list_id', 'created_at', 'id'],
        unique=False,
        postgresql_ops={'created_at': 'DESC', 'id': 'DESC'},
    )


def downgrade() -> None:
    """Drop newest-first list items index."""
    op.drop_index('ix_list_items_list_id_created_at', table_name='list_items')
