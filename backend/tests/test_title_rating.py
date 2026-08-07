"""Unit tests for hybrid TMDB / Aperture title ratings."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from uuid import uuid4

from app.metadata.enrichment import build_extras_from_tmdb_payload
from app.metadata.models import ContentRatingStats
from app.metadata.title_rating import resolve_title_rating, tmdb_vote_to_stars


def _stats(*, count: int, rating_sum: str) -> ContentRatingStats:
    return ContentRatingStats(
        content_type='movie',
        content_id=uuid4(),
        rating_count=count,
        rating_sum=Decimal(rating_sum),
        updated_at=dt.datetime.now(dt.UTC),
    )


def test_tmdb_vote_to_stars() -> None:
    assert tmdb_vote_to_stars(8.2) == 4.1
    assert tmdb_vote_to_stars(7.0) == 3.5
    assert tmdb_vote_to_stars(0) == 0.0


def test_enrichment_includes_tmdb_votes() -> None:
    extras = build_extras_from_tmdb_payload(
        {
            'vote_average': 8.2,
            'vote_count': 22061,
            'genres': [{'id': 1, 'name': 'Action'}],
        },
        kind='movie',
    )
    assert extras['tmdb_vote_average'] == 8.2
    assert extras['tmdb_vote_count'] == 22061


def test_enrichment_rejects_invalid_votes() -> None:
    extras = build_extras_from_tmdb_payload(
        {'vote_average': True, 'vote_count': -3},
        kind='movie',
    )
    assert extras['tmdb_vote_average'] is None
    assert extras['tmdb_vote_count'] is None


def test_resolve_prefers_tmdb_below_threshold() -> None:
    rating = resolve_title_rating(
        extras_doc={'tmdb_vote_average': 8.2, 'tmdb_vote_count': 500},
        stats=_stats(count=99, rating_sum='396.0'),
        switch_threshold=100,
    )
    assert rating is not None
    assert rating.source == 'tmdb'
    assert rating.value == 4.1
    assert rating.count == 500


def test_resolve_switches_to_aperture_at_threshold() -> None:
    rating = resolve_title_rating(
        extras_doc={'tmdb_vote_average': 8.2, 'tmdb_vote_count': 500},
        stats=_stats(count=100, rating_sum='410.0'),
        switch_threshold=100,
    )
    assert rating is not None
    assert rating.source == 'aperture'
    assert rating.value == 4.1
    assert rating.count == 100


def test_resolve_hides_when_no_usable_score() -> None:
    assert (
        resolve_title_rating(
            extras_doc={'tmdb_vote_average': 0, 'tmdb_vote_count': 0},
            stats=None,
            switch_threshold=100,
        )
        is None
    )


async def test_get_stats_missing_table_is_soft_fail() -> None:
    """App-ahead-of-migrate: missing table must not break title detail."""
    from unittest.mock import AsyncMock

    from sqlalchemy.exc import ProgrammingError

    from app.metadata import rating_stats as rating_stats_service

    class _MissingTable(Exception):
        def __str__(self) -> str:
            return 'relation "content_rating_stats" does not exist'

    session = AsyncMock()
    session.execute = AsyncMock(
        side_effect=ProgrammingError('SELECT', {}, _MissingTable()),
    )
    session.rollback = AsyncMock()

    stats = await rating_stats_service.get_stats(
        session,
        content_type='movie',
        content_id=uuid4(),
    )
    assert stats is None
    session.rollback.assert_awaited_once()
