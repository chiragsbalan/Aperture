"""Stable public search response shapes (backend-agnostic for P6)."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

SearchHitType = Literal['movie', 'tv', 'person']
SearchCardType = Literal['movie', 'tv']
MatchQuality = Literal['strong', 'weak', 'none']


class SearchHit(BaseModel):
    """One warm catalog search result with polymorphic content ref."""

    type: SearchHitType
    id: uuid.UUID
    title: str
    year: int | None = None
    poster_url: str | None = None
    rank: float | None = Field(
        default=None,
        description='Relative rank score; omit from clients that ignore it.',
    )
    popularity: int = Field(
        default=0,
        description=(
            'Hybrid rater count for within-tier sort: Aperture rating_count '
            'at/above switch threshold, else TMDB vote_count.'
        ),
    )


class SearchCard(BaseModel):
    """Cold or warm title card for Related / External sections (ADR-0016)."""

    type: SearchCardType
    title: str
    year: int | None = None
    poster_url: str | None = None
    tmdb_id: int
    content_id: uuid.UUID | None = None
    popularity: int = Field(
        default=0,
        description=(
            'Hybrid rater count for within-tier sort: Aperture rating_count '
            'at/above switch threshold, else TMDB vote_count.'
        ),
    )


class SearchResponse(BaseModel):
    """Paginated warm FTS hits plus optional discovery sections."""

    q: str
    page: int
    limit: int
    total: int
    results: list[SearchHit]
    match_quality: MatchQuality | None = None
    related: list[SearchCard] | None = None
    external: list[SearchCard] | None = None
