"""Normalize TMDb-like payloads into the canonical catalog (idempotent)."""

from __future__ import annotations

import json
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.metadata import repository as metadata_repository
from app.metadata.cache_keys import (
    movie_detail_key,
    person_detail_key,
    tv_detail_key,
)
from app.metadata.models import ContentItem
from app.metadata.tmdb.client import TmdbClient
from app.metadata.tmdb.dto import (
    TmdbMovie,
    TmdbPerson,
    TmdbTvShow,
    parse_movie_list,
    parse_person_list,
    parse_tv_list,
)

FIXTURES_DIR = Path(__file__).resolve().parent / 'fixtures'
SOURCE_TMDB = 'tmdb'


def _parse_date(value: str | None) -> date | None:
    if value is None or not value.strip():
        return None
    return date.fromisoformat(value.strip())


def _popularity(value: float | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _load_json(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(raw, list):
        raise ValueError(f'fixture must be a JSON array: {path}')
    return raw


async def upsert_person_payload(
    session: AsyncSession,
    person: TmdbPerson,
    *,
    source: str = SOURCE_TMDB,
) -> None:
    """Upsert a person from a TMDb-like payload."""
    await metadata_repository.upsert_person(
        session,
        source=source,
        external_id=str(person.id),
        name=person.name,
        biography=person.biography,
        birthday=_parse_date(person.birthday),
        deathday=_parse_date(person.deathday),
        place_of_birth=person.place_of_birth,
        profile_path=person.profile_path,
    )


async def _ensure_credit_people(
    session: AsyncSession,
    *,
    source: str,
    movie_or_tv: TmdbMovie | TmdbTvShow,
) -> dict[int, Any]:
    """Upsert thin person shells from credits; return tmdb_id → Person."""
    people_by_tmdb: dict[int, Any] = {}
    for cast in movie_or_tv.credits.cast:
        person = await metadata_repository.upsert_person(
            session,
            source=source,
            external_id=str(cast.id),
            name=cast.name,
            profile_path=cast.profile_path,
        )
        people_by_tmdb[cast.id] = person
    for crew in movie_or_tv.credits.crew:
        if crew.id in people_by_tmdb:
            continue
        person = await metadata_repository.upsert_person(
            session,
            source=source,
            external_id=str(crew.id),
            name=crew.name,
            profile_path=crew.profile_path,
        )
        people_by_tmdb[crew.id] = person
    return people_by_tmdb


async def upsert_movie_payload(
    session: AsyncSession,
    movie: TmdbMovie,
    *,
    source: str = SOURCE_TMDB,
) -> ContentItem:
    """Upsert a movie, credits, and any missing people shells."""
    people = await _ensure_credit_people(session, source=source, movie_or_tv=movie)
    item = await metadata_repository.upsert_movie(
        session,
        source=source,
        external_id=str(movie.id),
        title=movie.title,
        original_title=movie.original_title,
        overview=movie.overview,
        poster_path=movie.poster_path,
        backdrop_path=movie.backdrop_path,
        popularity=_popularity(movie.popularity),
        release_date=_parse_date(movie.release_date),
        runtime_minutes=movie.runtime,
        status=movie.status,
        extras=movie.extras,
    )
    for cast in movie.credits.cast:
        person = people[cast.id]
        await metadata_repository.upsert_credit(
            session,
            content_item_id=item.id,
            person_id=person.id,
            credit_kind='cast',
            job='',
            character=cast.character or '',
            billing_order=cast.order,
        )
    for crew in movie.credits.crew:
        person = people[crew.id]
        await metadata_repository.upsert_credit(
            session,
            content_item_id=item.id,
            person_id=person.id,
            credit_kind='crew',
            job=crew.job or '',
            character='',
            billing_order=None,
        )
    return item


async def upsert_tv_payload(
    session: AsyncSession,
    show: TmdbTvShow,
    *,
    source: str = SOURCE_TMDB,
) -> ContentItem:
    """Upsert a TV show, seasons/episodes, credits, and people shells."""
    people = await _ensure_credit_people(session, source=source, movie_or_tv=show)
    item = await metadata_repository.upsert_tv_show(
        session,
        source=source,
        external_id=str(show.id),
        title=show.name,
        original_title=show.original_name,
        overview=show.overview,
        poster_path=show.poster_path,
        backdrop_path=show.backdrop_path,
        popularity=_popularity(show.popularity),
        first_air_date=_parse_date(show.first_air_date),
        last_air_date=_parse_date(show.last_air_date),
        status=show.status,
        number_of_seasons=show.number_of_seasons,
        number_of_episodes=show.number_of_episodes,
        extras=show.extras,
    )
    for cast in show.credits.cast:
        person = people[cast.id]
        await metadata_repository.upsert_credit(
            session,
            content_item_id=item.id,
            person_id=person.id,
            credit_kind='cast',
            job='',
            character=cast.character or '',
            billing_order=cast.order,
        )
    for crew in show.credits.crew:
        person = people[crew.id]
        await metadata_repository.upsert_credit(
            session,
            content_item_id=item.id,
            person_id=person.id,
            credit_kind='crew',
            job=crew.job or '',
            character='',
            billing_order=None,
        )
    for season_payload in show.seasons:
        season = await metadata_repository.upsert_season(
            session,
            tv_show_id=item.id,
            season_number=season_payload.season_number,
            name=season_payload.name,
            overview=season_payload.overview,
            air_date=_parse_date(season_payload.air_date),
            episode_count=season_payload.episode_count,
            poster_path=season_payload.poster_path,
        )
        for episode_payload in season_payload.episodes:
            await metadata_repository.upsert_episode(
                session,
                season_id=season.id,
                episode_number=episode_payload.episode_number,
                name=episode_payload.name,
                overview=episode_payload.overview,
                air_date=_parse_date(episode_payload.air_date),
                runtime_minutes=episode_payload.runtime,
                still_path=episode_payload.still_path,
            )
    return item


async def ensure_movie_from_tmdb(
    session: AsyncSession,
    tmdb_id: int,
    *,
    client: TmdbClient,
) -> uuid.UUID:
    """Return catalog id for a TMDb movie, ingesting on first resolve.

    Concurrent inserts may race on ``external_ids`` uniqueness; on
    ``IntegrityError`` we rollback, re-read the winner's mapping, and retry
    the full ensure once (max 2 attempts).
    """
    for attempt in range(2):
        mapping = await metadata_repository.get_external_id(
            session,
            source=SOURCE_TMDB,
            source_namespace='movie',
            external_id=str(tmdb_id),
        )
        if mapping is not None and mapping.content_item_id is not None:
            return mapping.content_item_id

        try:
            movie = await client.get_movie_for_ingest(tmdb_id)
            item = await upsert_movie_payload(session, movie)
            await session.commit()
            await get_cache().delete(movie_detail_key(item.id))
            return item.id
        except IntegrityError:
            await session.rollback()
            mapping = await metadata_repository.get_external_id(
                session,
                source=SOURCE_TMDB,
                source_namespace='movie',
                external_id=str(tmdb_id),
            )
            if mapping is not None and mapping.content_item_id is not None:
                return mapping.content_item_id
            if attempt == 0:
                continue
            raise
    raise RuntimeError('ensure_movie_from_tmdb exhausted retries')


async def ensure_tv_from_tmdb(
    session: AsyncSession,
    tmdb_id: int,
    *,
    client: TmdbClient,
) -> uuid.UUID:
    """Return catalog id for a TMDb TV show, ingesting on first resolve.

    Concurrent inserts may race on ``external_ids`` uniqueness; on
    ``IntegrityError`` we rollback, re-read the winner's mapping, and retry
    the full ensure once (max 2 attempts).
    """
    for attempt in range(2):
        mapping = await metadata_repository.get_external_id(
            session,
            source=SOURCE_TMDB,
            source_namespace='tv',
            external_id=str(tmdb_id),
        )
        if mapping is not None and mapping.content_item_id is not None:
            return mapping.content_item_id

        try:
            show = await client.get_tv_for_ingest(tmdb_id)
            item = await upsert_tv_payload(session, show)
            await session.commit()
            await get_cache().delete(tv_detail_key(item.id))
            return item.id
        except IntegrityError:
            await session.rollback()
            mapping = await metadata_repository.get_external_id(
                session,
                source=SOURCE_TMDB,
                source_namespace='tv',
                external_id=str(tmdb_id),
            )
            if mapping is not None and mapping.content_item_id is not None:
                return mapping.content_item_id
            if attempt == 0:
                continue
            raise
    raise RuntimeError('ensure_tv_from_tmdb exhausted retries')


async def seed_from_fixtures(
    session: AsyncSession,
    *,
    fixtures_dir: Path | None = None,
) -> dict[str, int]:
    """Load bundled JSON fixtures and upsert into the catalog.

    Idempotent via ``external_ids``. Returns counts of processed rows.
    """
    root = fixtures_dir or FIXTURES_DIR
    people = parse_person_list(_load_json(root / 'people.json'))
    movies = parse_movie_list(_load_json(root / 'movies.json'))
    shows = parse_tv_list(_load_json(root / 'tv.json'))

    # Content first (creates thin person shells from credits), then full
    # people payloads so biographies / birthdays win over cast stubs.
    for movie in movies:
        await upsert_movie_payload(session, movie)
    for show in shows:
        await upsert_tv_payload(session, show)
    for person in people:
        await upsert_person_payload(session, person)

    await session.commit()
    await _invalidate_detail_cache(
        session,
        movies=movies,
        shows=shows,
        people=people,
    )
    return {
        'people': len(people),
        'movies': len(movies),
        'tv_shows': len(shows),
    }


async def _invalidate_detail_cache(
    session: AsyncSession,
    *,
    movies: list[TmdbMovie],
    shows: list[TmdbTvShow],
    people: list[TmdbPerson],
) -> None:
    """Drop cached detail payloads for re-ingested entities."""
    cache = get_cache()
    for movie in movies:
        ext = await metadata_repository.get_external_id(
            session,
            source=SOURCE_TMDB,
            source_namespace='movie',
            external_id=str(movie.id),
        )
        if ext is not None and ext.content_item_id is not None:
            await cache.delete(movie_detail_key(ext.content_item_id))
    for show in shows:
        ext = await metadata_repository.get_external_id(
            session,
            source=SOURCE_TMDB,
            source_namespace='tv',
            external_id=str(show.id),
        )
        if ext is not None and ext.content_item_id is not None:
            await cache.delete(tv_detail_key(ext.content_item_id))
    for person in people:
        ext = await metadata_repository.get_external_id(
            session,
            source=SOURCE_TMDB,
            source_namespace='person',
            external_id=str(person.id),
        )
        if ext is not None and ext.person_id is not None:
            await cache.delete(person_detail_key(ext.person_id))
