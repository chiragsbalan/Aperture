"""Canonical metadata catalog tables (P2.1).

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-01 23:30:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: str | Sequence[str] | None = 'd4e5f6a7b8c9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create content_items, subtypes, people, external_ids, and credits."""
    op.create_table(
        'content_items',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('content_type', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=512), nullable=False),
        sa.Column('original_title', sa.String(length=512), nullable=True),
        sa.Column('overview', sa.Text(), nullable=True),
        sa.Column('poster_path', sa.String(length=512), nullable=True),
        sa.Column('backdrop_path', sa.String(length=512), nullable=True),
        sa.Column('popularity', sa.Numeric(precision=12, scale=3), nullable=True),
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
            name=op.f('ck_content_items_content_type'),
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_content_items')),
        sa.UniqueConstraint(
            'id',
            'content_type',
            name='uq_content_items_id_content_type',
        ),
    )

    op.create_table(
        'movies',
        sa.Column('content_item_id', sa.Uuid(), nullable=False),
        sa.Column(
            'content_type',
            sa.String(length=32),
            server_default='movie',
            nullable=False,
        ),
        sa.Column('release_date', sa.Date(), nullable=True),
        sa.Column('runtime_minutes', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=64), nullable=True),
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
            "content_type = 'movie'",
            name=op.f('ck_movies_content_type_movie'),
        ),
        sa.ForeignKeyConstraint(
            ['content_item_id', 'content_type'],
            ['content_items.id', 'content_items.content_type'],
            name='fk_movies_content_item',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('content_item_id', name=op.f('pk_movies')),
    )

    op.create_table(
        'tv_shows',
        sa.Column('content_item_id', sa.Uuid(), nullable=False),
        sa.Column(
            'content_type',
            sa.String(length=32),
            server_default='tv_show',
            nullable=False,
        ),
        sa.Column('first_air_date', sa.Date(), nullable=True),
        sa.Column('last_air_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=64), nullable=True),
        sa.Column('number_of_seasons', sa.Integer(), nullable=True),
        sa.Column('number_of_episodes', sa.Integer(), nullable=True),
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
            "content_type = 'tv_show'",
            name=op.f('ck_tv_shows_content_type_tv_show'),
        ),
        sa.ForeignKeyConstraint(
            ['content_item_id', 'content_type'],
            ['content_items.id', 'content_items.content_type'],
            name='fk_tv_shows_content_item',
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('content_item_id', name=op.f('pk_tv_shows')),
    )

    op.create_table(
        'people',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=512), nullable=False),
        sa.Column('biography', sa.Text(), nullable=True),
        sa.Column('birthday', sa.Date(), nullable=True),
        sa.Column('deathday', sa.Date(), nullable=True),
        sa.Column('place_of_birth', sa.String(length=512), nullable=True),
        sa.Column('profile_path', sa.String(length=512), nullable=True),
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
        sa.PrimaryKeyConstraint('id', name=op.f('pk_people')),
    )

    op.create_table(
        'external_ids',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('source', sa.String(length=64), nullable=False),
        sa.Column('source_namespace', sa.String(length=64), nullable=False),
        sa.Column('external_id', sa.String(length=128), nullable=False),
        sa.Column('entity_type', sa.String(length=32), nullable=False),
        sa.Column('content_item_id', sa.Uuid(), nullable=True),
        sa.Column('person_id', sa.Uuid(), nullable=True),
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
            '('
            "entity_type = 'content_item' "
            'AND content_item_id IS NOT NULL '
            'AND person_id IS NULL'
            ') OR ('
            "entity_type = 'person' "
            'AND person_id IS NOT NULL '
            'AND content_item_id IS NULL'
            ')',
            name=op.f('ck_external_ids_entity_xor'),
        ),
        sa.ForeignKeyConstraint(
            ['content_item_id'],
            ['content_items.id'],
            name=op.f('fk_external_ids_content_item_id_content_items'),
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['person_id'],
            ['people.id'],
            name=op.f('fk_external_ids_person_id_people'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_external_ids')),
        sa.UniqueConstraint(
            'source',
            'source_namespace',
            'external_id',
            name='uq_external_ids_source_namespace_external_id',
        ),
    )
    op.create_index(
        op.f('ix_external_ids_content_item_id'),
        'external_ids',
        ['content_item_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_external_ids_person_id'),
        'external_ids',
        ['person_id'],
        unique=False,
    )

    op.create_table(
        'seasons',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('tv_show_id', sa.Uuid(), nullable=False),
        sa.Column('season_number', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=512), nullable=True),
        sa.Column('overview', sa.Text(), nullable=True),
        sa.Column('air_date', sa.Date(), nullable=True),
        sa.Column('episode_count', sa.Integer(), nullable=True),
        sa.Column('poster_path', sa.String(length=512), nullable=True),
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
        sa.ForeignKeyConstraint(
            ['tv_show_id'],
            ['tv_shows.content_item_id'],
            name=op.f('fk_seasons_tv_show_id_tv_shows'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_seasons')),
        sa.UniqueConstraint(
            'tv_show_id',
            'season_number',
            name='uq_seasons_tv_show_id_season_number',
        ),
    )
    op.create_index(
        op.f('ix_seasons_tv_show_id'),
        'seasons',
        ['tv_show_id'],
        unique=False,
    )

    op.create_table(
        'episodes',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('season_id', sa.Uuid(), nullable=False),
        sa.Column('episode_number', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=512), nullable=True),
        sa.Column('overview', sa.Text(), nullable=True),
        sa.Column('air_date', sa.Date(), nullable=True),
        sa.Column('runtime_minutes', sa.Integer(), nullable=True),
        sa.Column('still_path', sa.String(length=512), nullable=True),
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
        sa.ForeignKeyConstraint(
            ['season_id'],
            ['seasons.id'],
            name=op.f('fk_episodes_season_id_seasons'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_episodes')),
        sa.UniqueConstraint(
            'season_id',
            'episode_number',
            name='uq_episodes_season_id_episode_number',
        ),
    )
    op.create_index(
        op.f('ix_episodes_season_id'),
        'episodes',
        ['season_id'],
        unique=False,
    )

    op.create_table(
        'content_credits',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('content_item_id', sa.Uuid(), nullable=False),
        sa.Column('person_id', sa.Uuid(), nullable=False),
        sa.Column('credit_kind', sa.String(length=16), nullable=False),
        sa.Column(
            'job',
            sa.String(length=128),
            server_default='',
            nullable=False,
        ),
        sa.Column(
            'character',
            sa.String(length=512),
            server_default='',
            nullable=False,
        ),
        sa.Column('billing_order', sa.Integer(), nullable=True),
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
            "credit_kind IN ('cast', 'crew')",
            name=op.f('ck_content_credits_credit_kind'),
        ),
        sa.ForeignKeyConstraint(
            ['content_item_id'],
            ['content_items.id'],
            name=op.f('fk_content_credits_content_item_id_content_items'),
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['person_id'],
            ['people.id'],
            name=op.f('fk_content_credits_person_id_people'),
            ondelete='RESTRICT',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_content_credits')),
        sa.UniqueConstraint(
            'content_item_id',
            'person_id',
            'credit_kind',
            'job',
            'character',
            name='uq_content_credits_identity',
        ),
    )
    op.create_index(
        op.f('ix_content_credits_content_item_id'),
        'content_credits',
        ['content_item_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_content_credits_person_id'),
        'content_credits',
        ['person_id'],
        unique=False,
    )


def downgrade() -> None:
    """Drop metadata catalog tables."""
    op.drop_index(
        op.f('ix_content_credits_person_id'),
        table_name='content_credits',
    )
    op.drop_index(
        op.f('ix_content_credits_content_item_id'),
        table_name='content_credits',
    )
    op.drop_table('content_credits')
    op.drop_index(op.f('ix_episodes_season_id'), table_name='episodes')
    op.drop_table('episodes')
    op.drop_index(op.f('ix_seasons_tv_show_id'), table_name='seasons')
    op.drop_table('seasons')
    op.drop_index(op.f('ix_external_ids_person_id'), table_name='external_ids')
    op.drop_index(
        op.f('ix_external_ids_content_item_id'),
        table_name='external_ids',
    )
    op.drop_table('external_ids')
    op.drop_table('people')
    op.drop_table('tv_shows')
    op.drop_table('movies')
    op.drop_table('content_items')
