"""Hybrid title rating: Aperture community avg or TMDB fallback."""

from __future__ import annotations

from typing import Any, Literal

from app.metadata.models import ContentRatingStats
from app.metadata.rating_stats import aperture_average
from app.metadata.schemas import TitleRating

RatingSource = Literal['tmdb', 'aperture']


def tmdb_vote_to_stars(vote_average: float) -> float:
    """Convert TMDB 0–10 average to the product 0–5 scale."""
    return vote_average / 2.0


def resolve_title_rating(
    *,
    extras_doc: dict[str, Any] | None,
    stats: ContentRatingStats | None,
    switch_threshold: int,
) -> TitleRating | None:
    """Pick Aperture avg when count ≥ threshold, else TMDB /2.

    Returns ``None`` when neither source has a usable score.
    """
    aperture_count = int(stats.rating_count) if stats is not None else 0
    if aperture_count >= switch_threshold and stats is not None:
        avg = aperture_average(stats)
        if avg is not None:
            return TitleRating(
                value=round(avg, 2),
                source='aperture',
                count=aperture_count,
            )

    doc = extras_doc if isinstance(extras_doc, dict) else {}
    raw_avg = doc.get('tmdb_vote_average')
    raw_count = doc.get('tmdb_vote_count')
    if isinstance(raw_avg, (int, float)) and isinstance(raw_count, (int, float)):
        vote_count = int(raw_count)
        vote_average = float(raw_avg)
        if vote_count > 0 and vote_average > 0:
            return TitleRating(
                value=round(tmdb_vote_to_stars(vote_average), 2),
                source='tmdb',
                count=vote_count,
            )
    return None
