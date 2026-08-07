"""Trim volatile enrichment keys from content_items.extras (Option B).

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-08-07 12:00:00.000000

Removes ``watch_providers``, ``videos``, ``images``, and ``similar`` from
persisted extras. Those sections are hybrid-filled from Redis/TMDb at read
time. Lean meta (genres, tagline, networks, …) is retained.

Irreversible for dropped JSON keys (downgrade is a no-op).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = 'b4c5d6e7f8a9'
down_revision: str | Sequence[str] | None = 'a3b4c5d6e7f8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Strip enrichment keys from all catalog extras documents."""
    # jsonb - text removes one key; chain for all enrichment keys.
    op.execute(
        """
        UPDATE content_items
        SET extras = extras
            - 'watch_providers'
            - 'videos'
            - 'images'
            - 'similar'
        WHERE extras ?| ARRAY[
            'watch_providers',
            'videos',
            'images',
            'similar'
        ]
        """
    )


def downgrade() -> None:
    """Cannot restore trimmed enrichment blobs — no-op."""
    pass
