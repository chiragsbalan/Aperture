"""Empty schema baseline (P0.4).

No domain tables yet — establishes a single Alembic head so CI can enforce
linear migration history. Domain tables arrive in P1+.

Revision ID: 3bf7446b0701
Revises:
Create Date: 2026-08-01 16:19:09.891668
"""

from __future__ import annotations

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = '3bf7446b0701'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Apply baseline (no-op)."""


def downgrade() -> None:
    """Revert baseline (no-op)."""
