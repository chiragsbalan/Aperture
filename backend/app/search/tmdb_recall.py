"""TMDb External / Related enrichment for interim search recall (ADR-0016)."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.core.config import Settings
from app.metadata import repository as metadata_repository
from app.metadata import service as metadata_service
from app.metadata.images import InvalidImagePathError, tmdb_image_url
from app.metadata.tmdb.client import (
    TmdbClient,
    TmdbConfigError,
    TmdbUnavailableError,
)
from app.search.schemas import SearchCard, SearchCardType

logger = logging.getLogger(__name__)

_NEG_SENTINEL = {'_neg': True}

_external_flights: dict[str, asyncio.Future[list[SearchCard]]] = {}
_external_flights_lock = asyncio.Lock()


def _image_url(path: str | None, *, size: str = 'w342') -> str | None:
    try:
        return tmdb_image_url(path, size=size)
    except InvalidImagePathError:
        return None


def _external_cache_key(query: str, types: frozenset[str]) -> str:
    type_key = ','.join(sorted(types))
    digest = hashlib.sha256(f'{query}|{type_key}'.encode()).hexdigest()
    return f'search:tmdb:ext:v1:{digest}'


def _year_from_date(value: object) -> int | None:
    if not isinstance(value, str) or len(value) < 4 or not value[:4].isdigit():
        return None
    return int(value[:4])


def _parse_multi_results(
    payload: dict[str, Any],
    *,
    allowed_kinds: frozenset[str],
    cap: int,
) -> list[SearchCard]:
    cards: list[SearchCard] = []
    seen: set[tuple[str, int]] = set()
    for row in payload.get('results') or []:
        if not isinstance(row, dict):
            continue
        media = row.get('media_type')
        if media not in ('movie', 'tv') or media not in allowed_kinds:
            continue
        try:
            tmdb_id = int(row['id'])
        except (KeyError, TypeError, ValueError):
            continue
        if tmdb_id <= 0:
            continue
        key = (media, tmdb_id)
        if key in seen:
            continue
        title = row.get('title') if media == 'movie' else row.get('name')
        if not isinstance(title, str) or not title.strip():
            continue
        year = _year_from_date(
            row.get('release_date') if media == 'movie' else row.get('first_air_date')
        )
        poster = row.get('poster_path')
        poster_url = _image_url(poster if isinstance(poster, str) else None)
        typed: SearchCardType = 'movie' if media == 'movie' else 'tv'
        vote_raw = row.get('vote_count')
        try:
            popularity = max(0, int(vote_raw)) if vote_raw is not None else 0
        except (TypeError, ValueError):
            popularity = 0
        seen.add(key)
        cards.append(
            SearchCard(
                type=typed,
                title=title.strip(),
                year=year,
                poster_url=poster_url,
                tmdb_id=tmdb_id,
                content_id=None,
                popularity=popularity,
            )
        )
        if len(cards) >= cap:
            break
    return cards


async def _map_content_ids(
    session: AsyncSession,
    cards: list[SearchCard],
) -> list[SearchCard]:
    if not cards:
        return cards
    by_ns: dict[str, list[str]] = {'movie': [], 'tv': []}
    for card in cards:
        by_ns[card.type].append(str(card.tmdb_id))
    mapped: dict[tuple[str, str], uuid.UUID] = {}
    for namespace, external_ids in by_ns.items():
        if not external_ids:
            continue
        rows = await metadata_repository.get_external_ids_by_external(
            session,
            source='tmdb',
            source_namespace=namespace,
            external_ids=external_ids,
        )
        for ext_id, row in rows.items():
            if row.content_item_id is not None:
                mapped[(namespace, ext_id)] = row.content_item_id
    out: list[SearchCard] = []
    for card in cards:
        content_id = mapped.get((card.type, str(card.tmdb_id)))
        if content_id is not None:
            out.append(card.model_copy(update={'content_id': content_id}))
        else:
            out.append(card)
    return out


def _dedupe_against_warm(
    cards: list[SearchCard],
    *,
    warm_ids: set[uuid.UUID],
) -> list[SearchCard]:
    out: list[SearchCard] = []
    for card in cards:
        if card.content_id is not None and card.content_id in warm_ids:
            continue
        out.append(card)
    return out


async def _load_external_cache(key: str) -> list[SearchCard] | None:
    raw = await get_cache().get(key)
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, dict) and parsed.get('_neg') is True:
        return []
    if not isinstance(parsed, list):
        return None
    cards: list[SearchCard] = []
    for row in parsed:
        if not isinstance(row, dict):
            continue
        try:
            cards.append(SearchCard.model_validate(row))
        except Exception:
            continue
    return cards


async def _store_external_cache(
    key: str,
    cards: list[SearchCard],
    *,
    settings: Settings,
    negative: bool = False,
) -> None:
    if negative:
        await get_cache().set(
            key,
            json.dumps(_NEG_SENTINEL, separators=(',', ':')),
            ttl_seconds=settings.search_external_negative_cache_ttl_seconds,
        )
        return
    payload = [card.model_dump(mode='json') for card in cards]
    await get_cache().set(
        key,
        json.dumps(payload, separators=(',', ':'), default=str),
        ttl_seconds=settings.search_external_cache_ttl_seconds,
    )


async def _fetch_external_live(
    session: AsyncSession,
    *,
    query: str,
    allowed_kinds: frozenset[str],
    settings: Settings,
) -> list[SearchCard]:
    try:
        client = TmdbClient.from_settings(settings)
    except TmdbConfigError:
        return []

    timeout_s = settings.search_tmdb_timeout_ms / 1000.0
    try:
        payload = await asyncio.wait_for(
            client.search_multi(query, page=1),
            timeout=timeout_s,
        )
    except (TimeoutError, TmdbUnavailableError, Exception) as exc:
        logger.info('search external TMDb skipped for %r: %s', query, exc)
        return []

    cards = _parse_multi_results(
        payload,
        allowed_kinds=allowed_kinds,
        cap=settings.search_external_cap,
    )
    return await _map_content_ids(session, cards)


async def fetch_external_cards(
    session: AsyncSession,
    *,
    query: str,
    types: frozenset[str],
    settings: Settings,
    title_hits: int,
    warm_ids: set[uuid.UUID],
    allow_live: bool,
) -> list[SearchCard]:
    """Return External section cards (empty on skip / failure)."""
    allowed = frozenset(t for t in types if t in ('movie', 'tv'))
    if not allowed:
        return []

    cache_key = _external_cache_key(query, allowed)
    cached = await _load_external_cache(cache_key)
    if cached is not None:
        return _dedupe_against_warm(cached, warm_ids=warm_ids)

    if not allow_live:
        return []

    if title_hits != 0 and not settings.search_external_weak_live:
        return []

    async with _external_flights_lock:
        existing = _external_flights.get(cache_key)
        if existing is not None:
            waiter: asyncio.Future[list[SearchCard]] = existing
        else:
            loop = asyncio.get_running_loop()
            waiter = loop.create_future()
            _external_flights[cache_key] = waiter
            existing = None

    if existing is not None:
        try:
            cards = await waiter
        except Exception:
            return []
        return _dedupe_against_warm(cards, warm_ids=warm_ids)

    try:
        cards = await _fetch_external_live(
            session,
            query=query,
            allowed_kinds=allowed,
            settings=settings,
        )
        if cards:
            await _store_external_cache(cache_key, cards, settings=settings)
        else:
            await _store_external_cache(
                cache_key,
                [],
                settings=settings,
                negative=True,
            )
        if not waiter.done():
            waiter.set_result(cards)
        return _dedupe_against_warm(cards, warm_ids=warm_ids)
    except Exception as exc:
        logger.info('search external failed for %r: %s', query, exc)
        await _store_external_cache(
            cache_key,
            [],
            settings=settings,
            negative=True,
        )
        if not waiter.done():
            waiter.set_result([])
        return []
    finally:
        async with _external_flights_lock:
            if _external_flights.get(cache_key) is waiter:
                del _external_flights[cache_key]


async def fetch_related_cards(
    session: AsyncSession,
    *,
    top_title: dict[str, object],
    types: frozenset[str],
    settings: Settings,
    warm_ids: set[uuid.UUID],
) -> list[SearchCard]:
    """Related cards from enrichment similar for the top warm title."""
    kind = top_title.get('type')
    if kind not in ('movie', 'tv') or kind not in types:
        return []
    content_id = top_title.get('id')
    if not isinstance(content_id, uuid.UUID):
        try:
            content_id = uuid.UUID(str(content_id))
        except (TypeError, ValueError):
            return []

    timeout_s = settings.search_tmdb_timeout_ms / 1000.0
    try:
        rows = await asyncio.wait_for(
            metadata_service.fetch_search_related_similar(
                session,
                content_id=content_id,
                kind=str(kind),
                settings=settings,
                cap=settings.search_related_cap,
            ),
            timeout=timeout_s,
        )
    except (TimeoutError, Exception) as exc:
        logger.info('search related skipped for %s: %s', content_id, exc)
        return []

    cards: list[SearchCard] = []
    typed: SearchCardType = 'movie' if kind == 'movie' else 'tv'
    for row in rows:
        try:
            tmdb_id = int(row['tmdb_id'])
        except (KeyError, TypeError, ValueError):
            continue
        year = row.get('year')
        poster_path = row.get('poster_path')
        vote_raw = row.get('vote_count')
        try:
            popularity = max(0, int(vote_raw)) if vote_raw is not None else 0
        except (TypeError, ValueError):
            popularity = 0
        cards.append(
            SearchCard(
                type=typed,
                title=str(row['title']),
                year=year if isinstance(year, int) else None,
                poster_url=_image_url(
                    poster_path if isinstance(poster_path, str) else None
                ),
                tmdb_id=tmdb_id,
                content_id=None,
                popularity=popularity,
            )
        )

    cards = await _map_content_ids(session, cards)
    return _dedupe_against_warm(cards, warm_ids=warm_ids)
