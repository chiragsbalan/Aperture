"""Search application service (FTS + interim TMDb recall)."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.metadata import service as metadata_service
from app.search.query import (
    SearchQueryError,
    normalize_search_query,
    parse_types_param,
)
from app.search.popularity import attach_card_popularity, attach_hit_popularity
from app.search.schemas import (
    MatchQuality,
    SearchHit,
    SearchHitType,
    SearchResponse,
)
from app.search.tmdb_recall import fetch_external_cards, fetch_related_cards

DEFAULT_LIMIT = 20
MAX_LIMIT = 50


def _clamp_page(page: int) -> int:
    return max(1, page)


def _clamp_limit(limit: int) -> int:
    if limit < 1:
        return DEFAULT_LIMIT
    return min(limit, MAX_LIMIT)


def _match_quality(title_hits: int, *, strong_at: int) -> MatchQuality:
    if title_hits <= 0:
        return 'none'
    if title_hits < strong_at:
        return 'weak'
    return 'strong'


async def search(
    session: AsyncSession,
    *,
    settings: Settings,
    q: str | None,
    types: str | None,
    page: int = 1,
    limit: int = DEFAULT_LIMIT,
) -> SearchResponse:
    """Validate query params and return warm FTS plus optional sections."""
    query = normalize_search_query(q)
    type_set = parse_types_param(types)
    page_n = _clamp_page(page)
    limit_n = _clamp_limit(limit)

    raw_hits, total, title_total, top_title = await metadata_service.search_catalog(
        session,
        query=query,
        types=type_set,
        page=page_n,
        limit=limit_n,
    )
    results: list[SearchHit] = []
    warm_ids: set[uuid.UUID] = set()
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
        if typed in ('movie', 'tv'):
            warm_ids.add(entity_id)

    results = await attach_hit_popularity(session, results, settings=settings)

    quality = _match_quality(
        title_total,
        strong_at=settings.search_title_hits_strong,
    )

    related = None
    external = None
    if page_n == 1:
        related_cards = []
        if top_title is not None and title_total >= 1:
            related_cards = await fetch_related_cards(
                session,
                top_title=top_title,
                types=type_set,
                settings=settings,
                warm_ids=warm_ids,
            )
        related = await attach_card_popularity(
            session,
            related_cards,
            settings=settings,
        )

        # Live TMDb when zero title hits; weak locals use cache unless flag on.
        want_external = title_total < settings.search_title_hits_strong
        if want_external:
            allow_live = title_total == 0 or settings.search_external_weak_live
            external_cards = await fetch_external_cards(
                session,
                query=query,
                types=type_set,
                settings=settings,
                title_hits=title_total,
                warm_ids=warm_ids,
                allow_live=allow_live,
            )
            external = await attach_card_popularity(
                session,
                external_cards,
                settings=settings,
            )
        else:
            external = []

    return SearchResponse(
        q=query,
        page=page_n,
        limit=limit_n,
        total=total,
        results=results,
        match_quality=quality,
        related=related,
        external=external,
    )


# Re-export for API error mapping.
__all__ = ['SearchQueryError', 'SearchHitType', 'search']
