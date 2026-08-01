"""Public list / watchlist / favorites DTOs."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

PublicContentType = Literal['movie', 'tv']
SystemListKind = Literal['watchlist', 'favorites']


class ContentRefBody(BaseModel):
    """Polymorphic Aperture content pointer (movie/TV only in P3)."""

    type: str = Field(
        ...,
        min_length=1,
        max_length=16,
        description='Public type: movie | tv (tv_show accepted as alias).',
        examples=['movie', 'tv'],
    )
    id: uuid.UUID


class ContentSummary(BaseModel):
    """Compact title card embedded in list responses."""

    type: PublicContentType
    id: uuid.UUID
    title: str
    year: int | None = None
    poster_url: str | None = None


class ListItemResponse(BaseModel):
    """One membership row with display fields."""

    item_id: uuid.UUID
    position: int
    added_at: datetime
    content: ContentSummary


class SystemListResponse(BaseModel):
    """Paginated system list (watchlist or favorites)."""

    kind: SystemListKind
    title: str
    page: int
    limit: int
    total: int
    items: list[ListItemResponse]


class ContainsResponse(BaseModel):
    """Batch membership flags keyed by ``type:id``."""

    membership: dict[str, bool]
