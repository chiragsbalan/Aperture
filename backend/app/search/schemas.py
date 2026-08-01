"""Stable public search response shapes (backend-agnostic for P6)."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

SearchHitType = Literal['movie', 'tv', 'person']


class SearchHit(BaseModel):
    """One search result with polymorphic content ref."""

    type: SearchHitType
    id: uuid.UUID
    title: str
    year: int | None = None
    poster_url: str | None = None
    rank: float | None = Field(
        default=None,
        description='Relative rank score; omit from clients that ignore it.',
    )


class SearchResponse(BaseModel):
    """Paginated search hits."""

    q: str
    page: int
    limit: int
    total: int
    results: list[SearchHit]
