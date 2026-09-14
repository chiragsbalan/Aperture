"""Public diary / watch_entries DTOs."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_serializer

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


ReviewSort = Literal['popular', 'recent']
SpoilerFilter = Literal['all', 'no_spoilers']
RatingFilter = Literal['any', '5', '4_plus', '3_plus', 'below_3']
RatingSort = Literal['highest', 'lowest', 'recent']
VoteValue = Literal[1, -1]


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
    contains_spoilers: bool = Field(
        default=False,
        description='Author flag: this review text contains spoilers.',
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
    contains_spoilers: bool | None = Field(
        default=None,
        description='Author flag: this review text contains spoilers.',
    )

    @field_validator('rating')
    @classmethod
    def rating_half_stars(cls, value: float | None) -> float | None:
        return _validate_rating(value)


class PutReviewVoteBody(BaseModel):
    """Set, switch, or clear the caller's vote on a review."""

    vote: VoteValue | None = Field(
        default=None,
        description='1 like, -1 dislike, or null to clear.',
    )


class WatchEntryResponse(BaseModel):
    """One diary row with content summary."""

    id: uuid.UUID
    watched_at: date
    note: str | None = None
    rating: float | None = None
    contains_spoilers: bool = False
    created_at: datetime
    updated_at: datetime
    content: ContentSummary


class ReviewAuthor(BaseModel):
    """Public author chip for a title-page or profile review."""

    username: str
    display_name: str | None = None
    avatar_url: str | None = None


class ReviewResponse(BaseModel):
    """One qualifying watch log shown as a public review (ADR-0019)."""

    id: uuid.UUID
    rating: float
    contains_spoilers: bool
    watched_at: date
    like_count: int
    dislike_count: int
    score: int
    author: ReviewAuthor
    viewer_vote: VoteValue | None = None
    content: ContentSummary | None = None
    note: str | None = None
    include_note: bool = Field(default=True, exclude=True)

    @model_serializer(mode='wrap')
    def _omit_hidden_note(
        self,
        serializer: Callable[[ReviewResponse], dict[str, object]],
    ) -> dict[str, object]:
        data = serializer(self)
        if not self.include_note:
            data.pop('note', None)
        return data


class ReviewsPageResponse(BaseModel):
    """Paginated public reviews for a title or profile."""

    page: int
    limit: int
    total: int
    items: list[ReviewResponse]


class TitleRatingItem(BaseModel):
    """One viewer's current diary rating for a title (ADR-0015 latest)."""

    rating: float
    watched_at: date
    author: ReviewAuthor


class TitleRatingsPageResponse(BaseModel):
    """Paginated people who have rated a title."""

    page: int
    limit: int
    total: int
    items: list[TitleRatingItem]


class WatchEntriesPageResponse(BaseModel):
    """Paginated diary feed (newest watched_at first)."""

    page: int
    limit: int
    total: int
    items: list[WatchEntryResponse]


class WatchEntriesContainsResponse(BaseModel):
    """Batch flags: owner has at least one diary row for each ``type:id``."""

    membership: dict[str, bool]


class WatchEntriesRatingsResponse(BaseModel):
    """Latest non-null diary rating per ``type:id`` (omits unrated / unknown)."""

    ratings: dict[str, float]
