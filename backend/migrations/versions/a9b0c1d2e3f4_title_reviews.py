"""Title-page reviews: spoiler flag, vote counters, review_votes.

Revision ID: a9b0c1d2e3f4
Revises: d6e7f8a9b0c1
Create Date: 2026-09-14 10:30:00.000000

A review is a qualifying watch_entries row (note + rating). Votes live in
review_votes; like_count / dislike_count are denormalized on the diary row.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'a9b0c1d2e3f4'
down_revision: str | Sequence[str] | None = 'd6e7f8a9b0c1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ELIGIBLE = "note IS NOT NULL AND btrim(note) <> '' AND rating IS NOT NULL"


def upgrade() -> None:
    """Add review columns, review_votes, and eligibility indexes."""
    op.add_column(
        'watch_entries',
        sa.Column(
            'contains_spoilers',
            sa.Boolean(),
            server_default='false',
            nullable=False,
        ),
    )
    op.add_column(
        'watch_entries',
        sa.Column(
            'like_count',
            sa.Integer(),
            server_default='0',
            nullable=False,
        ),
    )
    op.add_column(
        'watch_entries',
        sa.Column(
            'dislike_count',
            sa.Integer(),
            server_default='0',
            nullable=False,
        ),
    )
    op.create_check_constraint(
        'like_count_nonneg',
        'watch_entries',
        'like_count >= 0',
    )
    op.create_check_constraint(
        'dislike_count_nonneg',
        'watch_entries',
        'dislike_count >= 0',
    )

    op.create_table(
        'review_votes',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('watch_entry_id', sa.Uuid(), nullable=False),
        sa.Column('voter_user_id', sa.Uuid(), nullable=False),
        sa.Column('vote', sa.SmallInteger(), nullable=False),
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
        sa.CheckConstraint('vote IN (1, -1)', name=op.f('ck_review_votes_vote')),
        sa.ForeignKeyConstraint(
            ['watch_entry_id'],
            ['watch_entries.id'],
            name=op.f('fk_review_votes_watch_entry_id_watch_entries'),
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['voter_user_id'],
            ['users.id'],
            name=op.f('fk_review_votes_voter_user_id_users'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_review_votes')),
        sa.UniqueConstraint(
            'watch_entry_id',
            'voter_user_id',
            name='uq_review_votes_entry_voter',
        ),
    )
    op.create_index(
        'ix_review_votes_voter_user_id',
        'review_votes',
        ['voter_user_id'],
    )

    op.execute(
        f"""
        CREATE INDEX ix_watch_entries_title_reviews_popular
        ON watch_entries (
            content_type,
            content_id,
            (like_count - dislike_count) DESC,
            watched_at DESC,
            id DESC
        )
        WHERE {_ELIGIBLE}
        """
    )
    op.execute(
        f"""
        CREATE INDEX ix_watch_entries_title_reviews_recent
        ON watch_entries (
            content_type,
            content_id,
            watched_at DESC,
            created_at DESC,
            id DESC
        )
        WHERE {_ELIGIBLE}
        """
    )
    op.execute(
        f"""
        CREATE INDEX ix_watch_entries_owner_reviews
        ON watch_entries (
            owner_user_id,
            watched_at DESC,
            created_at DESC,
            id DESC
        )
        WHERE {_ELIGIBLE}
        """
    )


def downgrade() -> None:
    """Drop review indexes, review_votes, and review columns."""
    op.execute('DROP INDEX IF EXISTS ix_watch_entries_owner_reviews')
    op.execute('DROP INDEX IF EXISTS ix_watch_entries_title_reviews_recent')
    op.execute('DROP INDEX IF EXISTS ix_watch_entries_title_reviews_popular')
    op.drop_index('ix_review_votes_voter_user_id', table_name='review_votes')
    op.drop_table('review_votes')
    op.drop_constraint('dislike_count_nonneg', 'watch_entries', type_='check')
    op.drop_constraint('like_count_nonneg', 'watch_entries', type_='check')
    op.drop_column('watch_entries', 'dislike_count')
    op.drop_column('watch_entries', 'like_count')
    op.drop_column('watch_entries', 'contains_spoilers')
