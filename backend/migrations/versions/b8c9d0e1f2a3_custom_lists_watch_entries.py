"""Custom lists owner/kind index + watch_entries diary (P3.3 / P3.4).

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-08-02 02:40:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: str | Sequence[str] | None = 'a7b8c9d0e1f2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add lists owner+kind index and watch_entries table."""
    op.create_index(
        'ix_lists_owner_kind',
        'lists',
        ['owner_user_id', 'kind'],
    )

    op.create_table(
        'watch_entries',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('owner_user_id', sa.Uuid(), nullable=False),
        sa.Column('content_type', sa.String(length=32), nullable=False),
        sa.Column('content_id', sa.Uuid(), nullable=False),
        sa.Column('watched_at', sa.Date(), nullable=False),
        sa.Column('note', sa.String(length=1000), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.CheckConstraint(
            "content_type IN ('movie', 'tv_show')",
            name=op.f('ck_watch_entries_content_type'),
        ),
        sa.ForeignKeyConstraint(
            ['owner_user_id'],
            ['users.id'],
            name=op.f('fk_watch_entries_owner_user_id_users'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_watch_entries')),
    )
    op.create_index(
        'ix_watch_entries_owner_watched_at',
        'watch_entries',
        ['owner_user_id', 'watched_at'],
        postgresql_ops={'watched_at': 'DESC'},
    )
    op.create_index(
        'ix_watch_entries_owner_content',
        'watch_entries',
        ['owner_user_id', 'content_type', 'content_id'],
    )


def downgrade() -> None:
    """Drop watch_entries and lists owner+kind index."""
    op.drop_index(
        'ix_watch_entries_owner_content',
        table_name='watch_entries',
    )
    op.drop_index(
        'ix_watch_entries_owner_watched_at',
        table_name='watch_entries',
    )
    op.drop_table('watch_entries')
    op.drop_index('ix_lists_owner_kind', table_name='lists')
