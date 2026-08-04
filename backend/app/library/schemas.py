"""Public diary / watch_entries DTOs."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

PublicContentType = Literal['movie', 'tv']

ALLOWED_RATINGS = frozenset(
    {0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0},
)


def _validate_rating(value: float | None) -> float | None:
    if value is None:
        return None
    normalized = float(value)
    if normalized not in ALLOWED_RATINGS:
        raise ValueError('rating must be 0.5–5.0 in half-star steps')
    return normalized


class ContentSummary(BaseModel):
    """Compact title card embedded in diary responses."""

    type: PublicContentType
    id: uuid.UUID
    title: str
    year: int | None = None
    poster_url: str | None = None


class CreateWatchEntryBody(BaseModel):
    """Log a watch event. Duplicate content refs are allowed (rewatch)."""

    type: str = Field(
        ...,
        min_length=1,
        max_length=16,
        description='Public type: movie | tv (tv_show accepted as alias).',
        examples=['movie', 'tv'],
    )
    id: uuid.UUID
    watched_at: date | None = Field(
        default=None,
        description='Watch date (UTC calendar date). Defaults to today (UTC).',
    )
    note: str | None = Field(default=None, max_length=1000)
    rating: float | None = Field(
        default=None,
        description='Optional rating 0.5–5.0 in half-star steps.',
    )

    @field_validator('rating')
    @classmethod
    def rating_half_stars(cls, value: float | None) -> float | None:
        return _validate_rating(value)


class PatchWatchEntryBody(BaseModel):
    """Partial update for a diary entry."""

    watched_at: date | None = None
    note: str | None = Field(default=None, max_length=1000)
    rating: float | None = Field(
        default=None,
        description='Optional rating 0.5–5.0; null clears when sent.',
    )

    @field_validator('rating')
    @classmethod
    def rating_half_stars(cls, value: float | None) -> float | None:
        return _validate_rating(value)


class WatchEntryResponse(BaseModel):
    """One diary row with content summary."""

    id: uuid.UUID
    watched_at: date
    note: str | None = None
    rating: float | None = None
    created_at: datetime
    updated_at: datetime
    content: ContentSummary


class WatchEntriesPageResponse(BaseModel):
    """Paginated diary feed (newest watched_at first)."""

    page: int
    limit: int
    total: int
    items: list[WatchEntryResponse]


class WatchEntriesContainsResponse(BaseModel):
    """Batch flags: owner has at least one diary row for each ``type:id``."""

    membership: dict[str, bool]
