"""Personal library lists + list_items (P3.1).

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-08-02 01:40:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: str | Sequence[str] | None = 'f6a7b8c9d0e1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create lists and list_items with system-kind uniqueness."""
    op.create_table(
        'lists',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('owner_user_id', sa.Uuid(), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=2000), nullable=True),
        sa.Column(
            'visibility',
            sa.String(length=32),
            server_default='private',
            nullable=False,
        ),
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
            "kind IN ('watchlist', 'favorites', 'custom')",
            name=op.f('ck_lists_kind'),
        ),
        sa.CheckConstraint(
            "visibility IN ('private', 'public', 'unlisted')",
            name=op.f('ck_lists_visibility'),
        ),
        sa.ForeignKeyConstraint(
            ['owner_user_id'],
            ['users.id'],
            name=op.f('fk_lists_owner_user_id_users'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_lists')),
    )
    op.create_index('ix_lists_owner_user_id', 'lists', ['owner_user_id'])
    op.create_index('ix_lists_visibility', 'lists', ['visibility'])
    op.create_index(
        'uq_lists_owner_system_kind',
        'lists',
        ['owner_user_id', 'kind'],
        unique=True,
        postgresql_where=sa.text("kind IN ('watchlist', 'favorites')"),
    )

    op.create_table(
        'list_items',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('list_id', sa.Uuid(), nullable=False),
        sa.Column('content_type', sa.String(length=32), nullable=False),
        sa.Column('content_id', sa.Uuid(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
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
            name=op.f('ck_list_items_content_type'),
        ),
        sa.ForeignKeyConstraint(
            ['list_id'],
            ['lists.id'],
            name=op.f('fk_list_items_list_id_lists'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_list_items')),
        sa.UniqueConstraint(
            'list_id',
            'content_type',
            'content_id',
            name='uq_list_items_list_content',
        ),
    )
    op.create_index(
        'ix_list_items_list_id_position',
        'list_items',
        ['list_id', 'position'],
    )


def downgrade() -> None:
    """Drop list_items and lists."""
    op.drop_index('ix_list_items_list_id_position', table_name='list_items')
    op.drop_table('list_items')
    op.drop_index('uq_lists_owner_system_kind', table_name='lists')
    op.drop_index('ix_lists_visibility', table_name='lists')
    op.drop_index('ix_lists_owner_user_id', table_name='lists')
    op.drop_table('lists')
