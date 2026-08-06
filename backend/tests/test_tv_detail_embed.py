"""Unit tests for thin TV detail preferred-season embedding."""

from __future__ import annotations

from types import SimpleNamespace

from app.metadata.service import _preferred_embed_season_number


def test_preferred_embed_prefers_season_one_over_specials() -> None:
    seasons = [
        SimpleNamespace(season_number=0, episodes=[]),
        SimpleNamespace(season_number=1, episodes=[]),
        SimpleNamespace(season_number=2, episodes=[]),
    ]
    assert _preferred_embed_season_number(seasons) == 1


def test_preferred_embed_falls_back_to_first_regular() -> None:
    seasons = [
        SimpleNamespace(season_number=0, episodes=[]),
        SimpleNamespace(season_number=3, episodes=[]),
        SimpleNamespace(season_number=5, episodes=[]),
    ]
    assert _preferred_embed_season_number(seasons) == 3


def test_preferred_embed_specials_only() -> None:
    seasons = [SimpleNamespace(season_number=0, episodes=[])]
    assert _preferred_embed_season_number(seasons) == 0


def test_preferred_embed_empty() -> None:
    assert _preferred_embed_season_number([]) is None
