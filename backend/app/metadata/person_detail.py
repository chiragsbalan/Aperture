"""Hybrid person detail assemble (ADR-0017).

Postgres shell + capped credits fallback; Redis/TMDb enrich for filmography,
socials, and also_known_as. Never assembles empty filmography over non-empty PG.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.core.config import Settings
from app.metadata import repository as metadata_repository
from app.metadata.cache_keys import (
    person_enrich_lock_key,
    person_enrichment_key,
)
from app.metadata.images import InvalidImagePathError, tmdb_image_url
from app.metadata.models import Person
from app.metadata.person_enrichment import (
    MAX_KNOWN_FOR,
    cards_from_cached,
    departments_from_cards,
    enrich_doc_from_tmdb_payload,
    parse_date,
    pg_fallback_enrich_fields,
    socials_from_cached,
)
from app.metadata.rate_limit import enforce_person_enrich_rate_limit
from app.metadata.schemas import PersonDetail, PersonTitleCard
from app.metadata.tmdb.client import TmdbClient, TmdbConfigError

logger = logging.getLogger(__name__)

_PERSON_ENRICH_NEGATIVE = {'_neg': True}

_person_enrich_sem: asyncio.Semaphore | None = None
_person_enrich_sem_max: int | None = None


def reset_person_enrich_semaphore() -> None:
    """Reset the global person-enrich inflight semaphore (tests)."""
    global _person_enrich_sem, _person_enrich_sem_max
    _person_enrich_sem = None
    _person_enrich_sem_max = None


def _semaphore(max_inflight: int) -> asyncio.Semaphore:
    global _person_enrich_sem, _person_enrich_sem_max
    if _person_enrich_sem is None or _person_enrich_sem_max != max_inflight:
        _person_enrich_sem = asyncio.Semaphore(max_inflight)
        _person_enrich_sem_max = max_inflight
    return _person_enrich_sem


def _image_url(path: str | None, *, size: str = 'h632') -> str | None:
    if not path:
        return None
    try:
        return tmdb_image_url(path, size=size)
    except InvalidImagePathError:
        return None


async def _load_enrich_doc(person_id: uuid.UUID) -> dict[str, Any] | None:
    raw = await get_cache().get(person_enrichment_key(person_id))
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _is_neg(doc: dict[str, Any] | None) -> bool:
    return doc is not None and doc.get('_neg') is True


async def _cache_enrich_doc(
    person_id: uuid.UUID,
    doc: dict[str, Any],
    *,
    settings: Settings,
) -> None:
    if not doc or doc.get('_neg'):
        return
    await get_cache().set(
        person_enrichment_key(person_id),
        json.dumps(doc, separators=(',', ':'), default=str),
        ttl_seconds=settings.metadata_enrichment_cache_ttl_seconds,
    )


async def _cache_enrich_neg(person_id: uuid.UUID, *, settings: Settings) -> None:
    await get_cache().set(
        person_enrichment_key(person_id),
        json.dumps(_PERSON_ENRICH_NEGATIVE, separators=(',', ':')),
        ttl_seconds=settings.metadata_enrichment_negative_cache_ttl_seconds,
    )


async def _map_title_card_ids(
    session: AsyncSession,
    cards: list[PersonTitleCard],
) -> list[PersonTitleCard]:
    if not cards:
        return cards
    by_ns: dict[str, list[str]] = {'movie': [], 'tv': []}
    for card in cards:
        if card.tmdb_id is None or card.content_id is not None:
            continue
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
    out: list[PersonTitleCard] = []
    for card in cards:
        if card.content_id is not None or card.tmdb_id is None:
            out.append(card)
            continue
        content_id = mapped.get((card.type, str(card.tmdb_id)))
        if content_id is not None:
            out.append(card.model_copy(update={'content_id': content_id}))
        else:
            out.append(card)
    return out


async def _map_enrich_doc(
    session: AsyncSession,
    doc: dict[str, Any],
) -> dict[str, Any]:
    known_for = await _map_title_card_ids(
        session,
        cards_from_cached(
            doc.get('known_for') if isinstance(doc.get('known_for'), list) else None
        ),
    )
    filmography = await _map_title_card_ids(
        session,
        cards_from_cached(
            doc.get('filmography') if isinstance(doc.get('filmography'), list) else None
        ),
    )
    return {
        **doc,
        'known_for': [c.model_dump(mode='json') for c in known_for],
        'filmography': [c.model_dump(mode='json') for c in filmography],
    }


def assemble_person_detail(
    person: Person,
    *,
    enrich: dict[str, Any] | None,
    pg_fallback: dict[str, Any],
) -> PersonDetail:
    """Merge enrich overlay with PG shell; filmography falls back to PG when empty."""
    enrich_doc = enrich if isinstance(enrich, dict) and not enrich.get('_neg') else None

    enrich_filmography = cards_from_cached(
        enrich_doc.get('filmography') if enrich_doc else None
    )
    pg_filmography = cards_from_cached(pg_fallback.get('filmography'))
    filmography = enrich_filmography if enrich_filmography else pg_filmography

    enrich_known = cards_from_cached(
        enrich_doc.get('known_for') if enrich_doc else None
    )
    pg_known = cards_from_cached(pg_fallback.get('known_for'))
    if enrich_known:
        known_for = enrich_known
    elif enrich_filmography:
        known_for = enrich_filmography[:MAX_KNOWN_FOR]
    else:
        known_for = pg_known

    enrich_bio = enrich_doc.get('biography') if enrich_doc else None
    biography = (
        enrich_bio.strip()
        if isinstance(enrich_bio, str) and enrich_bio.strip()
        else person.biography
    )

    birthday = (
        parse_date(enrich_doc.get('birthday') if enrich_doc else None)
        or person.birthday
    )
    deathday = (
        parse_date(enrich_doc.get('deathday') if enrich_doc else None)
        or person.deathday
    )
    place = enrich_doc.get('place_of_birth') if enrich_doc else None
    place_of_birth = (
        place.strip()
        if isinstance(place, str) and place.strip()
        else person.place_of_birth
    )

    known_for_department = None
    also_known_as: list[str] = []
    socials = []
    if enrich_doc:
        kfd = enrich_doc.get('known_for_department')
        if isinstance(kfd, str) and kfd.strip():
            known_for_department = kfd.strip()
        aka = enrich_doc.get('also_known_as')
        if isinstance(aka, list):
            also_known_as = [a for a in aka if isinstance(a, str)]
        socials = socials_from_cached(
            enrich_doc.get('socials')
            if isinstance(enrich_doc.get('socials'), list)
            else None
        )

    return PersonDetail(
        type='person',
        id=person.id,
        name=person.name,
        biography=biography,
        birthday=birthday,
        deathday=deathday,
        place_of_birth=place_of_birth,
        profile_url=_image_url(person.profile_path, size='h632'),
        known_for_department=known_for_department,
        also_known_as=also_known_as,
        socials=socials,
        known_for=known_for,
        filmography=filmography,
        departments=departments_from_cards(
            filmography,
            preferred=known_for_department,
        ),
    )


async def _wait_for_enrich_or_lock(
    person_id: uuid.UUID,
    *,
    settings: Settings,
) -> dict[str, Any] | None:
    """Poll until enrich appears or the lock TTL elapses."""
    deadline = (
        time.monotonic() + float(settings.metadata_person_enrich_lock_ttl_seconds) + 0.5
    )
    while time.monotonic() < deadline:
        cached = await _load_enrich_doc(person_id)
        if cached is not None:
            return cached
        lock_held = await get_cache().get(person_enrich_lock_key(person_id))
        if lock_held is None:
            return None
        await asyncio.sleep(0.05)
    return await _load_enrich_doc(person_id)


async def _live_person_enrich(
    session: AsyncSession,
    person: Person,
    *,
    settings: Settings,
    attested_client_ip: str | None,
) -> dict[str, Any] | None:
    """Fetch+curate TMDb person enrich under dual RL, semaphore, and ≤2s timeout."""
    mapping = await metadata_repository.get_external_id_for_person(
        session,
        source='tmdb',
        person_id=person.id,
    )
    if mapping is None or not mapping.external_id:
        return None
    try:
        tmdb_id = int(mapping.external_id)
    except ValueError:
        return None

    try:
        client = TmdbClient.from_settings(settings)
    except TmdbConfigError:
        return None

    await enforce_person_enrich_rate_limit(
        get_cache(),
        settings=settings,
        attested_client_ip=attested_client_ip,
    )

    timeout_s = settings.metadata_person_enrich_timeout_ms / 1000.0
    sem = _semaphore(settings.metadata_person_enrich_inflight_max)
    async with sem:
        try:
            payload = await asyncio.wait_for(
                client.get_person_enrichment(tmdb_id),
                timeout=timeout_s,
            )
        except TimeoutError:
            logger.info('person enrich timed out for %s', person.id)
            return None
        except Exception as exc:
            logger.info('person enrich failed for %s: %s', person.id, exc)
            return None

    if not isinstance(payload, dict):
        return None
    doc = enrich_doc_from_tmdb_payload(payload)
    return await _map_enrich_doc(session, doc)


async def resolve_person_enrich(
    session: AsyncSession,
    person: Person,
    *,
    settings: Settings,
    attested_client_ip: str | None,
) -> dict[str, Any] | None:
    """Return enrich doc (or None/neg handled by caller via PG fallback).

    Uses Redis lock for multi-instance coalesce; waiters poll the enrich key.
    """
    cached = await _load_enrich_doc(person.id)
    if _is_neg(cached):
        return cached
    if cached is not None:
        return await _map_enrich_doc(session, cached)

    cache = get_cache()
    lock_key = person_enrich_lock_key(person.id)
    acquired = await cache.set_nx(
        lock_key,
        '1',
        ttl_seconds=settings.metadata_person_enrich_lock_ttl_seconds,
    )
    if not acquired:
        waited = await _wait_for_enrich_or_lock(person.id, settings=settings)
        if waited is not None:
            if _is_neg(waited):
                return waited
            return await _map_enrich_doc(session, waited)
        acquired = await cache.set_nx(
            lock_key,
            '1',
            ttl_seconds=settings.metadata_person_enrich_lock_ttl_seconds,
        )
        if not acquired:
            return None

    try:
        # Re-check after lock (another leader may have finished).
        again = await _load_enrich_doc(person.id)
        if again is not None:
            if _is_neg(again):
                return again
            return await _map_enrich_doc(session, again)

        live = await _live_person_enrich(
            session,
            person,
            settings=settings,
            attested_client_ip=attested_client_ip,
        )
        if live is None:
            await _cache_enrich_neg(person.id, settings=settings)
            return _PERSON_ENRICH_NEGATIVE
        await _cache_enrich_doc(person.id, live, settings=settings)
        return live
    finally:
        await cache.delete(lock_key)


async def get_person_detail(
    session: AsyncSession,
    person_id: uuid.UUID,
    *,
    settings: Settings,
    attested_client_ip: str | None = None,
) -> PersonDetail:
    """Load hybrid person detail or raise LookupError-style via caller.

    Raises:
        KeyError: when the person row is missing (mapped by service layer).
    """
    person = await metadata_repository.get_person_by_id(session, person_id)
    if person is None:
        raise KeyError('person not found')

    pg_fallback = pg_fallback_enrich_fields(person)
    enrich = await resolve_person_enrich(
        session,
        person,
        settings=settings,
        attested_client_ip=attested_client_ip,
    )
    # Neg / missing enrich → assemble still uses PG filmography.
    enrich_for_assemble = None if _is_neg(enrich) else enrich
    return assemble_person_detail(
        person,
        enrich=enrich_for_assemble,
        pg_fallback=pg_fallback,
    )
