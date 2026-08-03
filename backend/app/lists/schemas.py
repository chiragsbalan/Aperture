"""Public list / watchlist / favorites / custom list DTOs."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

PublicContentType = Literal['movie', 'tv']
SystemListKind = Literal['watchlist', 'favorites']
ListVisibility = Literal['private', 'public']


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
    visibility: ListVisibility
    page: int
    limit: int
    total: int
    items: list[ListItemResponse]


class PatchSystemListVisibilityBody(BaseModel):
    """Owner toggle for watchlist / favorites visibility."""

    visibility: ListVisibility


class ContainsResponse(BaseModel):
    """Batch membership flags keyed by ``type:id``."""

    membership: dict[str, bool]


class CreateCustomListBody(BaseModel):
    """Create a user-owned custom list."""

    title: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    visibility: ListVisibility = 'private'


class PatchCustomListBody(BaseModel):
    """Partial update for a custom list."""

    title: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    visibility: ListVisibility | None = None


class CustomListSummary(BaseModel):
    """One custom list in the owner's index."""

    id: uuid.UUID
    title: str
    description: str | None = None
    visibility: ListVisibility
    item_count: int
    created_at: datetime
    updated_at: datetime


class CustomListPageResponse(BaseModel):
    """Owner's custom lists."""

    lists: list[CustomListSummary]


class CustomListDetailResponse(BaseModel):
    """Custom list metadata (items via the items endpoint)."""

    id: uuid.UUID
    title: str
    description: str | None = None
    visibility: ListVisibility
    kind: Literal['custom'] = 'custom'
    owner_user_id: uuid.UUID | None = None
    is_owner: bool
    item_count: int
    created_at: datetime
    updated_at: datetime


class CustomListItemsResponse(BaseModel):
    """Paginated items on a custom list."""

    list_id: uuid.UUID
    page: int
    limit: int
    total: int
    items: list[ListItemResponse]


class ReorderItemsBody(BaseModel):
    """Set exact membership order. Must be set-equal to current item ids."""

    item_ids: list[uuid.UUID] = Field(..., min_length=0, max_length=500)


class CustomListMembershipResponse(BaseModel):
    """Per-custom-list membership for one content ref (add-to-list chooser)."""

    membership: dict[str, bool]
    item_ids: dict[str, uuid.UUID] = Field(
        default_factory=dict,
        description='list_id → item_id when the content is on that list',
    )
