"""Unit tests for hybrid search popularity counts."""

from app.search.popularity import popularity_count


def test_popularity_uses_tmdb_below_threshold() -> None:
    assert (
        popularity_count(
            aperture_count=12,
            tmdb_count=8400,
            switch_threshold=100,
        )
        == 8400
    )


def test_popularity_uses_aperture_at_threshold() -> None:
    assert (
        popularity_count(
            aperture_count=100,
            tmdb_count=8400,
            switch_threshold=100,
        )
        == 100
    )


def test_popularity_uses_aperture_above_threshold() -> None:
    assert (
        popularity_count(
            aperture_count=250,
            tmdb_count=12,
            switch_threshold=100,
        )
        == 250
    )


def test_popularity_clamps_negative() -> None:
    assert (
        popularity_count(
            aperture_count=-3,
            tmdb_count=-9,
            switch_threshold=100,
        )
        == 0
    )
