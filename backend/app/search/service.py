"""Search application service (delegates FTS to Metadata)."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.metadata import service as metadata_service
from app.search.query import (
    SearchQueryError,
    normalize_search_query,
    parse_types_param,
)
from app.search.schemas import SearchHit, SearchHitType, SearchResponse

DEFAULT_LIMIT = 20
MAX_LIMIT = 50


def _clamp_page(page: int) -> int:
    return max(1, page)


def _clamp_limit(limit: int) -> int:
    if limit < 1:
        return DEFAULT_LIMIT
    return min(limit, MAX_LIMIT)


async def search(
    session: AsyncSession,
    *,
    q: str | None,
    types: str | None,
    page: int = 1,
    limit: int = DEFAULT_LIMIT,
) -> SearchResponse:
    """Validate query params and return a stable search envelope."""
    query = normalize_search_query(q)
    type_set = parse_types_param(types)
    page_n = _clamp_page(page)
    limit_n = _clamp_limit(limit)

    raw_hits, total = await metadata_service.search_catalog(
        session,
        query=query,
        types=type_set,
        page=page_n,
        limit=limit_n,
    )
    results: list[SearchHit] = []
    for hit in raw_hits:
        hit_type = hit['type']
        if hit_type not in ('movie', 'tv', 'person'):
            continue
        typed: SearchHitType = hit_type
        entity_id = hit['id']
        if not isinstance(entity_id, uuid.UUID):
            entity_id = uuid.UUID(str(entity_id))
        year_val = hit.get('year')
        rank_val = hit.get('rank')
        poster_val = hit.get('poster_url')
        results.append(
            SearchHit(
                type=typed,
                id=entity_id,
                title=str(hit['title']),
                year=year_val if isinstance(year_val, int) else None,
                poster_url=str(poster_val) if poster_val is not None else None,
                rank=float(rank_val) if isinstance(rank_val, (int, float)) else None,
            )
        )
    return SearchResponse(
        q=query,
        page=page_n,
        limit=limit_n,
        total=total,
        results=results,
    )


# Re-export for API error mapping.
__all__ = ['SearchQueryError', 'SearchHitType', 'search']
