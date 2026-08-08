"""Hybrid popularity counts for search ranking (ADR-0015 threshold)."""

from __future__ import annotations

import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.core.config import Settings
from app.metadata import rating_stats as rating_stats_service
from app.metadata.cache_keys import movie_enrichment_key, tv_enrichment_key
from app.search.schemas import SearchCard, SearchHit


def popularity_count(
    *,
    aperture_count: int,
    tmdb_count: int,
    switch_threshold: int,
) -> int:
    """Aperture rater count at/above threshold; else TMDB vote_count."""
    if aperture_count >= switch_threshold:
        return max(0, aperture_count)
    return max(0, tmdb_count)


async def _tmdb_vote_counts_from_enrichment(
    *,
    items: list[tuple[uuid.UUID, str]],
) -> dict[uuid.UUID, int]:
    """Read cached enrichment ``tmdb_vote_count`` for catalog titles."""
    out: dict[uuid.UUID, int] = {}
    cache = get_cache()
    for content_id, kind in items:
        key = (
            movie_enrichment_key(content_id)
            if kind == 'movie'
            else tv_enrichment_key(content_id)
        )
        raw = await cache.get(key)
        if raw is None:
            continue
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(parsed, dict) or parsed.get('_neg'):
            continue
        vote = parsed.get('tmdb_vote_count')
        if isinstance(vote, (int, float)) and int(vote) > 0:
            out[content_id] = int(vote)
    return out


async def attach_hit_popularity(
    session: AsyncSession,
    hits: list[SearchHit],
    *,
    settings: Settings,
) -> list[SearchHit]:
    """Set ``popularity`` on warm title hits using hybrid rating counts."""
    title_hits = [h for h in hits if h.type in ('movie', 'tv')]
    if not title_hits:
        return hits

    ids = [h.id for h in title_hits]
    stats_by_id = await rating_stats_service.get_stats_for_content_ids(
        session,
        content_ids=ids,
    )
    need_tmdb_pairs: list[tuple[uuid.UUID, str]] = []
    for hit in title_hits:
        stats = stats_by_id.get(hit.id)
        aperture_count = int(stats.rating_count) if stats is not None else 0
        if aperture_count < settings.aperture_rating_switch_threshold:
            need_tmdb_pairs.append((hit.id, hit.type))

    tmdb_counts = await _tmdb_vote_counts_from_enrichment(items=need_tmdb_pairs)
    threshold = settings.aperture_rating_switch_threshold
    out: list[SearchHit] = []
    for hit in hits:
        if hit.type not in ('movie', 'tv'):
            out.append(hit)
            continue
        stats = stats_by_id.get(hit.id)
        aperture_count = int(stats.rating_count) if stats is not None else 0
        tmdb_count = tmdb_counts.get(hit.id, 0)
        out.append(
            hit.model_copy(
                update={
                    'popularity': popularity_count(
                        aperture_count=aperture_count,
                        tmdb_count=tmdb_count,
                        switch_threshold=threshold,
                    )
                }
            )
        )
    return out


async def attach_card_popularity(
    session: AsyncSession,
    cards: list[SearchCard],
    *,
    settings: Settings,
) -> list[SearchCard]:
    """Refresh card popularity when mapped to catalog (Aperture @ threshold)."""
    if not cards:
        return cards
    mapped_ids = [c.content_id for c in cards if c.content_id is not None]
    stats_by_id = await rating_stats_service.get_stats_for_content_ids(
        session,
        content_ids=mapped_ids,
    )
    threshold = settings.aperture_rating_switch_threshold
    out: list[SearchCard] = []
    for card in cards:
        tmdb_count = card.popularity
        aperture_count = 0
        if card.content_id is not None:
            stats = stats_by_id.get(card.content_id)
            aperture_count = int(stats.rating_count) if stats is not None else 0
        out.append(
            card.model_copy(
                update={
                    'popularity': popularity_count(
                        aperture_count=aperture_count,
                        tmdb_count=tmdb_count,
                        switch_threshold=threshold,
                    )
                }
            )
        )
    return out
