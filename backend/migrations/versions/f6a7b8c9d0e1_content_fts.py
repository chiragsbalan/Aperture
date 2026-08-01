"""Add PostgreSQL FTS columns for catalog search (P2.3).

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-02 00:50:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: str | Sequence[str] | None = 'e5f6a7b8c9d0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add generated tsvector columns + GIN indexes; backfill is automatic."""
    op.execute(
        """
        ALTER TABLE content_items
        ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            setweight(
                to_tsvector(
                    'english',
                    coalesce(title, '')
                ),
                'A'
            )
            || setweight(
                to_tsvector(
                    'english',
                    coalesce(original_title, '')
                ),
                'A'
            )
            || setweight(
                to_tsvector(
                    'english',
                    coalesce(overview, '')
                ),
                'B'
            )
        ) STORED
        """
    )
    op.execute(
        """
        CREATE INDEX ix_content_items_search_vector
        ON content_items
        USING gin (search_vector)
        """
    )
    op.execute(
        """
        ALTER TABLE people
        ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            setweight(
                to_tsvector('english', coalesce(name, '')),
                'A'
            )
        ) STORED
        """
    )
    op.execute(
        """
        CREATE INDEX ix_people_search_vector
        ON people
        USING gin (search_vector)
        """
    )


def downgrade() -> None:
    """Drop FTS indexes and generated columns."""
    op.execute('DROP INDEX IF EXISTS ix_people_search_vector')
    op.execute('ALTER TABLE people DROP COLUMN IF EXISTS search_vector')
    op.execute('DROP INDEX IF EXISTS ix_content_items_search_vector')
    op.execute('ALTER TABLE content_items DROP COLUMN IF EXISTS search_vector')
