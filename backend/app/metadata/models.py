"""Canonical catalog ORM models (ADR-0004).

Titles live in ``content_items`` with typed subtype tables (``movies``,
``tv_shows``) linked via composite foreign keys. People, seasons, episodes,
and credits are first-class tables outside the content_items hierarchy.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins import TimestampMixin, UuidPrimaryKeyMixin


class ContentItem(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Canonical movie or TV-show row (Aperture-owned id)."""

    __tablename__ = 'content_items'

    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    original_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    overview: Mapped[str | None] = mapped_column(Text, nullable=True)
    poster_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    backdrop_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    popularity: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 3),
        nullable=True,
    )
    extras: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default='{}',
    )
    # Last time lean stub fields were refreshed from TMDb (Option B / ToS).
    refreshed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        CheckConstraint(
            "content_type IN ('movie', 'tv_show')",
            name='content_type',
        ),
        UniqueConstraint(
            'id',
            'content_type',
            name='uq_content_items_id_content_type',
        ),
    )

    movie: Mapped[Movie | None] = relationship(
        back_populates='content_item',
        uselist=False,
    )
    tv_show: Mapped[TvShow | None] = relationship(
        back_populates='content_item',
        uselist=False,
    )
    credits: Mapped[list[ContentCredit]] = relationship(
        back_populates='content_item',
    )


class Movie(TimestampMixin, Base):
    """Movie subtype row; PK is the parent ``content_items.id``."""

    __tablename__ = 'movies'

    content_item_id: Mapped[uuid.UUID] = mapped_column(Uuid(), primary_key=True)
    content_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default='movie',
        server_default='movie',
    )
    release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    runtime_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str | None] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        CheckConstraint("content_type = 'movie'", name='content_type_movie'),
        ForeignKeyConstraint(
            ['content_item_id', 'content_type'],
            ['content_items.id', 'content_items.content_type'],
            name='fk_movies_content_item',
            ondelete='CASCADE',
        ),
    )

    content_item: Mapped[ContentItem] = relationship(back_populates='movie')


class TvShow(TimestampMixin, Base):
    """TV-show subtype row; PK is the parent ``content_items.id``."""

    __tablename__ = 'tv_shows'

    content_item_id: Mapped[uuid.UUID] = mapped_column(Uuid(), primary_key=True)
    content_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default='tv_show',
        server_default='tv_show',
    )
    first_air_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_air_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    number_of_seasons: Mapped[int | None] = mapped_column(Integer, nullable=True)
    number_of_episodes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        CheckConstraint("content_type = 'tv_show'", name='content_type_tv_show'),
        ForeignKeyConstraint(
            ['content_item_id', 'content_type'],
            ['content_items.id', 'content_items.content_type'],
            name='fk_tv_shows_content_item',
            ondelete='CASCADE',
        ),
    )

    content_item: Mapped[ContentItem] = relationship(back_populates='tv_show')
    seasons: Mapped[list[Season]] = relationship(
        back_populates='tv_show',
        cascade='all, delete-orphan',
    )


class Person(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Canonical person (cast/crew) outside ``content_items``."""

    __tablename__ = 'people'

    name: Mapped[str] = mapped_column(String(512), nullable=False)
    biography: Mapped[str | None] = mapped_column(Text, nullable=True)
    birthday: Mapped[date | None] = mapped_column(Date, nullable=True)
    deathday: Mapped[date | None] = mapped_column(Date, nullable=True)
    place_of_birth: Mapped[str | None] = mapped_column(String(512), nullable=True)
    profile_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    credits: Mapped[list[ContentCredit]] = relationship(back_populates='person')


class ExternalId(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Provider key → canonical entity mapping (idempotent ingest)."""

    __tablename__ = 'external_ids'

    source: Mapped[str] = mapped_column(String(64), nullable=False)
    source_namespace: Mapped[str] = mapped_column(String(64), nullable=False)
    external_id: Mapped[str] = mapped_column(String(128), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    content_item_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(),
        ForeignKey('content_items.id', ondelete='CASCADE'),
        nullable=True,
        index=True,
    )
    person_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(),
        ForeignKey('people.id', ondelete='CASCADE'),
        nullable=True,
        index=True,
    )

    __table_args__ = (
        CheckConstraint(
            '('
            "entity_type = 'content_item' "
            'AND content_item_id IS NOT NULL '
            'AND person_id IS NULL'
            ') OR ('
            "entity_type = 'person' "
            'AND person_id IS NOT NULL '
            'AND content_item_id IS NULL'
            ')',
            name='entity_xor',
        ),
        UniqueConstraint(
            'source',
            'source_namespace',
            'external_id',
            name='uq_external_ids_source_namespace_external_id',
        ),
    )


class Season(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Season belonging to a TV show (outside ``content_items``)."""

    __tablename__ = 'seasons'

    tv_show_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey('tv_shows.content_item_id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    season_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    overview: Mapped[str | None] = mapped_column(Text, nullable=True)
    air_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    episode_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    poster_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            'tv_show_id',
            'season_number',
            name='uq_seasons_tv_show_id_season_number',
        ),
    )

    tv_show: Mapped[TvShow] = relationship(back_populates='seasons')
    episodes: Mapped[list[Episode]] = relationship(
        back_populates='season',
        cascade='all, delete-orphan',
    )


class Episode(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Episode belonging to a season."""

    __tablename__ = 'episodes'

    season_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey('seasons.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    episode_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    overview: Mapped[str | None] = mapped_column(Text, nullable=True)
    air_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    runtime_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    still_path: Mapped[str | None] = mapped_column(String(512), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            'season_id',
            'episode_number',
            name='uq_episodes_season_id_episode_number',
        ),
    )

    season: Mapped[Season] = relationship(back_populates='episodes')


class ContentCredit(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Unified cast/crew credit linking a content item to a person."""

    __tablename__ = 'content_credits'

    content_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey('content_items.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey('people.id', ondelete='RESTRICT'),
        nullable=False,
        index=True,
    )
    credit_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    job: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        default='',
        server_default='',
    )
    character: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        default='',
        server_default='',
    )
    billing_order: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "credit_kind IN ('cast', 'crew')",
            name='credit_kind',
        ),
        UniqueConstraint(
            'content_item_id',
            'person_id',
            'credit_kind',
            'job',
            'character',
            name='uq_content_credits_identity',
        ),
    )

    content_item: Mapped[ContentItem] = relationship(back_populates='credits')
    person: Mapped[Person] = relationship(back_populates='credits')
