"""Public diary / watch_entries DTOs."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

PublicContentType = Literal['movie', 'tv']


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
    remove_from_watchlist: bool = False


class PatchWatchEntryBody(BaseModel):
    """Partial update for a diary entry."""

    watched_at: date | None = None
    note: str | None = Field(default=None, max_length=1000)


class WatchEntryResponse(BaseModel):
    """One diary row with content summary."""

    id: uuid.UUID
    watched_at: date
    note: str | None = None
    created_at: datetime
    updated_at: datetime
    content: ContentSummary


class WatchEntriesPageResponse(BaseModel):
    """Paginated diary feed (newest watched_at first)."""

    page: int
    limit: int
    total: int
    items: list[WatchEntryResponse]
