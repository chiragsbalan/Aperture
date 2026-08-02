"""Persistence helpers for the metadata catalog."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import bindparam, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.metadata.models import (
    ContentCredit,
    ContentItem,
    Episode,
    ExternalId,
    Movie,
    Person,
    Season,
    TvShow,
)


async def get_external_id(
    session: AsyncSession,
    *,
    source: str,
    source_namespace: str,
    external_id: str,
) -> ExternalId | None:
    """Look up a provider mapping row."""
    result = await session.execute(
        select(ExternalId).where(
            ExternalId.source == source,
            ExternalId.source_namespace == source_namespace,
            ExternalId.external_id == external_id,
        )
    )
    return result.scalar_one_or_none()


async def get_movie_by_id(
    session: AsyncSession,
    content_item_id: uuid.UUID,
) -> ContentItem | None:
    """Return a movie content item with subtype + credits loaded."""
    result = await session.execute(
        select(ContentItem)
        .where(
            ContentItem.id == content_item_id,
            ContentItem.content_type == 'movie',
        )
        .options(
            selectinload(ContentItem.movie),
            selectinload(ContentItem.credits).selectinload(ContentCredit.person),
        )
    )
    return result.scalar_one_or_none()


async def get_tv_by_id(
    session: AsyncSession,
    content_item_id: uuid.UUID,
) -> ContentItem | None:
    """Return a TV content item with seasons/episodes + credits loaded."""
    result = await session.execute(
        select(ContentItem)
        .where(
            ContentItem.id == content_item_id,
            ContentItem.content_type == 'tv_show',
        )
        .options(
            selectinload(ContentItem.tv_show)
            .selectinload(TvShow.seasons)
            .selectinload(Season.episodes),
            selectinload(ContentItem.credits).selectinload(ContentCredit.person),
        )
    )
    return result.scalar_one_or_none()


async def get_person_by_id(
    session: AsyncSession,
    person_id: uuid.UUID,
) -> Person | None:
    """Return a person with credits and linked content titles."""
    result = await session.execute(
        select(Person)
        .where(Person.id == person_id)
        .options(
            selectinload(Person.credits).selectinload(ContentCredit.content_item),
        )
    )
    return result.scalar_one_or_none()


async def upsert_person(
    session: AsyncSession,
    *,
    source: str,
    external_id: str,
    name: str,
    biography: str | None = None,
    birthday: date | None = None,
    deathday: date | None = None,
    place_of_birth: str | None = None,
    profile_path: str | None = None,
) -> Person:
    """Create or update a person keyed by ``(source, person, external_id)``."""
    mapping = await get_external_id(
        session,
        source=source,
        source_namespace='person',
        external_id=external_id,
    )
    if mapping is not None and mapping.person_id is not None:
        person = await session.get(Person, mapping.person_id)
        if person is None:
            raise RuntimeError('external_ids person_id missing person row')
        # Credit shells often omit bio fields; never wipe richer data with None.
        person.name = name
        if biography is not None:
            person.biography = biography
        if birthday is not None:
            person.birthday = birthday
        if deathday is not None:
            person.deathday = deathday
        if place_of_birth is not None:
            person.place_of_birth = place_of_birth
        if profile_path is not None:
            person.profile_path = profile_path
        await session.flush()
        return person

    person = Person(
        name=name,
        biography=biography,
        birthday=birthday,
        deathday=deathday,
        place_of_birth=place_of_birth,
        profile_path=profile_path,
    )
    session.add(person)
    await session.flush()
    session.add(
        ExternalId(
            source=source,
            source_namespace='person',
            external_id=external_id,
            entity_type='person',
            person_id=person.id,
        )
    )
    await session.flush()
    return person


async def upsert_movie(
    session: AsyncSession,
    *,
    source: str,
    external_id: str,
    title: str,
    original_title: str | None = None,
    overview: str | None = None,
    poster_path: str | None = None,
    backdrop_path: str | None = None,
    popularity: Decimal | None = None,
    release_date: date | None = None,
    runtime_minutes: int | None = None,
    status: str | None = None,
    extras: dict[str, Any] | None = None,
) -> ContentItem:
    """Create or update a movie + content_item by TMDb (or fixture) id."""
    extras_doc = extras if extras is not None else {}
    mapping = await get_external_id(
        session,
        source=source,
        source_namespace='movie',
        external_id=external_id,
    )
    if mapping is not None and mapping.content_item_id is not None:
        result = await session.execute(
            select(ContentItem)
            .where(ContentItem.id == mapping.content_item_id)
            .options(selectinload(ContentItem.movie))
        )
        item = result.scalar_one()
        item.title = title
        item.original_title = original_title
        item.overview = overview
        item.poster_path = poster_path
        item.backdrop_path = backdrop_path
        item.popularity = popularity
        item.extras = extras_doc
        assert item.movie is not None
        item.movie.release_date = release_date
        item.movie.runtime_minutes = runtime_minutes
        item.movie.status = status
        await session.flush()
        return item

    item = ContentItem(
        content_type='movie',
        title=title,
        original_title=original_title,
        overview=overview,
        poster_path=poster_path,
        backdrop_path=backdrop_path,
        popularity=popularity,
        extras=extras_doc,
    )
    session.add(item)
    await session.flush()
    session.add(
        Movie(
            content_item_id=item.id,
            content_type='movie',
            release_date=release_date,
            runtime_minutes=runtime_minutes,
            status=status,
        )
    )
    session.add(
        ExternalId(
            source=source,
            source_namespace='movie',
            external_id=external_id,
            entity_type='content_item',
            content_item_id=item.id,
        )
    )
    await session.flush()
    return item


async def upsert_tv_show(
    session: AsyncSession,
    *,
    source: str,
    external_id: str,
    title: str,
    original_title: str | None = None,
    overview: str | None = None,
    poster_path: str | None = None,
    backdrop_path: str | None = None,
    popularity: Decimal | None = None,
    first_air_date: date | None = None,
    last_air_date: date | None = None,
    status: str | None = None,
    number_of_seasons: int | None = None,
    number_of_episodes: int | None = None,
    extras: dict[str, Any] | None = None,
) -> ContentItem:
    """Create or update a TV show + content_item by provider id."""
    extras_doc = extras if extras is not None else {}
    mapping = await get_external_id(
        session,
        source=source,
        source_namespace='tv',
        external_id=external_id,
    )
    if mapping is not None and mapping.content_item_id is not None:
        result = await session.execute(
            select(ContentItem)
            .where(ContentItem.id == mapping.content_item_id)
            .options(selectinload(ContentItem.tv_show))
        )
        item = result.scalar_one()
        item.title = title
        item.original_title = original_title
        item.overview = overview
        item.poster_path = poster_path
        item.backdrop_path = backdrop_path
        item.popularity = popularity
        item.extras = extras_doc
        assert item.tv_show is not None
        item.tv_show.first_air_date = first_air_date
        item.tv_show.last_air_date = last_air_date
        item.tv_show.status = status
        item.tv_show.number_of_seasons = number_of_seasons
        item.tv_show.number_of_episodes = number_of_episodes
        await session.flush()
        return item

    item = ContentItem(
        content_type='tv_show',
        title=title,
        original_title=original_title,
        overview=overview,
        poster_path=poster_path,
        backdrop_path=backdrop_path,
        popularity=popularity,
        extras=extras_doc,
    )
    session.add(item)
    await session.flush()
    session.add(
        TvShow(
            content_item_id=item.id,
            content_type='tv_show',
            first_air_date=first_air_date,
            last_air_date=last_air_date,
            status=status,
            number_of_seasons=number_of_seasons,
            number_of_episodes=number_of_episodes,
        )
    )
    session.add(
        ExternalId(
            source=source,
            source_namespace='tv',
            external_id=external_id,
            entity_type='content_item',
            content_item_id=item.id,
        )
    )
    await session.flush()
    return item


async def upsert_season(
    session: AsyncSession,
    *,
    tv_show_id: uuid.UUID,
    season_number: int,
    name: str | None = None,
    overview: str | None = None,
    air_date: date | None = None,
    episode_count: int | None = None,
    poster_path: str | None = None,
) -> Season:
    """Create or update a season for a TV show."""
    result = await session.execute(
        select(Season).where(
            Season.tv_show_id == tv_show_id,
            Season.season_number == season_number,
        )
    )
    season = result.scalar_one_or_none()
    if season is not None:
        season.name = name
        season.overview = overview
        season.air_date = air_date
        season.episode_count = episode_count
        season.poster_path = poster_path
        await session.flush()
        return season

    season = Season(
        tv_show_id=tv_show_id,
        season_number=season_number,
        name=name,
        overview=overview,
        air_date=air_date,
        episode_count=episode_count,
        poster_path=poster_path,
    )
    session.add(season)
    await session.flush()
    return season


async def upsert_episode(
    session: AsyncSession,
    *,
    season_id: uuid.UUID,
    episode_number: int,
    name: str | None = None,
    overview: str | None = None,
    air_date: date | None = None,
    runtime_minutes: int | None = None,
    still_path: str | None = None,
) -> Episode:
    """Create or update an episode within a season."""
    result = await session.execute(
        select(Episode).where(
            Episode.season_id == season_id,
            Episode.episode_number == episode_number,
        )
    )
    episode = result.scalar_one_or_none()
    if episode is not None:
        episode.name = name
        episode.overview = overview
        episode.air_date = air_date
        episode.runtime_minutes = runtime_minutes
        episode.still_path = still_path
        await session.flush()
        return episode

    episode = Episode(
        season_id=season_id,
        episode_number=episode_number,
        name=name,
        overview=overview,
        air_date=air_date,
        runtime_minutes=runtime_minutes,
        still_path=still_path,
    )
    session.add(episode)
    await session.flush()
    return episode


async def upsert_credit(
    session: AsyncSession,
    *,
    content_item_id: uuid.UUID,
    person_id: uuid.UUID,
    credit_kind: str,
    job: str = '',
    character: str = '',
    billing_order: int | None = None,
) -> ContentCredit:
    """Create or update a cast/crew credit (unique on identity columns)."""
    result = await session.execute(
        select(ContentCredit).where(
            ContentCredit.content_item_id == content_item_id,
            ContentCredit.person_id == person_id,
            ContentCredit.credit_kind == credit_kind,
            ContentCredit.job == job,
            ContentCredit.character == character,
        )
    )
    credit = result.scalar_one_or_none()
    if credit is not None:
        credit.billing_order = billing_order
        await session.flush()
        return credit

    credit = ContentCredit(
        content_item_id=content_item_id,
        person_id=person_id,
        credit_kind=credit_kind,
        job=job,
        character=character,
        billing_order=billing_order,
    )
    session.add(credit)
    await session.flush()
    return credit


async def get_content_items_by_refs(
    session: AsyncSession,
    *,
    refs: list[tuple[str, uuid.UUID]],
) -> list[ContentItem]:
    """Load content items matching ``(content_type, id)`` pairs.

    Loads movie/TV subtype rows for year extraction; no credits.
    """
    if not refs:
        return []
    content_ids = [content_id for _, content_id in refs]
    result = await session.execute(
        select(ContentItem)
        .where(ContentItem.id.in_(content_ids))
        .options(
            selectinload(ContentItem.movie),
            selectinload(ContentItem.tv_show),
        )
    )
    wanted = set(refs)
    return [
        item
        for item in result.scalars().all()
        if (item.content_type, item.id) in wanted
    ]


async def content_item_exists(
    session: AsyncSession,
    *,
    content_type: str,
    content_id: uuid.UUID,
) -> bool:
    """Return True when a content item exists with the given type + id."""
    result = await session.execute(
        select(ContentItem.id).where(
            ContentItem.id == content_id,
            ContentItem.content_type == content_type,
        )
    )
    return result.scalar_one_or_none() is not None


async def list_sample_content_ids(
    session: AsyncSession,
    *,
    limit: int = 5,
) -> list[tuple[str, uuid.UUID, str]]:
    """Return ``(kind, id, title)`` samples for CLI discovery output."""
    movies = await session.execute(
        select(ContentItem.id, ContentItem.title)
        .where(ContentItem.content_type == 'movie')
        .order_by(ContentItem.title)
        .limit(limit)
    )
    shows = await session.execute(
        select(ContentItem.id, ContentItem.title)
        .where(ContentItem.content_type == 'tv_show')
        .order_by(ContentItem.title)
        .limit(limit)
    )
    people = await session.execute(
        select(Person.id, Person.name).order_by(Person.name).limit(limit)
    )
    rows: list[tuple[str, uuid.UUID, str]] = [
        ('movie', row[0], row[1]) for row in movies.all()
    ]
    rows.extend(('tv', row[0], row[1]) for row in shows.all())
    rows.extend(('person', row[0], row[1]) for row in people.all())
    return rows


async def search_content_items(
    session: AsyncSession,
    *,
    query: str,
    content_types: frozenset[str],
    limit: int,
    offset: int,
) -> tuple[list[tuple[ContentItem, float, int | None]], int]:
    """FTS search movies/TV. ``content_types`` uses DB values ``movie``/``tv_show``.

    Returns ``(rows, total)`` where each row is
    ``(ContentItem, rank, year)``.
    """
    if not content_types:
        return [], 0

    types = sorted(content_types)
    count_stmt = text(
        """
        SELECT count(*)::int
        FROM content_items
        WHERE search_vector @@ plainto_tsquery('english', :q)
          AND content_type IN :types
        """
    ).bindparams(bindparam('types', expanding=True))
    total = int(
        (
            await session.execute(
                count_stmt,
                {'q': query, 'types': types},
            )
        ).scalar_one()
    )

    list_stmt = text(
        """
        SELECT
            c.id,
            ts_rank(
                c.search_vector,
                plainto_tsquery('english', :q)
            ) AS rank,
            COALESCE(
                EXTRACT(YEAR FROM m.release_date),
                EXTRACT(YEAR FROM t.first_air_date)
            )::int AS year
        FROM content_items c
        LEFT JOIN movies m ON m.content_item_id = c.id
        LEFT JOIN tv_shows t ON t.content_item_id = c.id
        WHERE c.search_vector @@ plainto_tsquery('english', :q)
          AND c.content_type IN :types
        ORDER BY rank DESC, c.title ASC
        LIMIT :limit OFFSET :offset
        """
    ).bindparams(bindparam('types', expanding=True))
    result = await session.execute(
        list_stmt,
        {
            'q': query,
            'types': types,
            'limit': limit,
            'offset': offset,
        },
    )
    hit_rows = result.all()
    items: list[tuple[ContentItem, float, int | None]] = []
    for row in hit_rows:
        item = await session.get(ContentItem, row.id)
        if item is None:
            continue
        year = int(row.year) if row.year is not None else None
        items.append((item, float(row.rank or 0.0), year))
    return items, total


async def search_people(
    session: AsyncSession,
    *,
    query: str,
    limit: int,
    offset: int,
) -> tuple[list[tuple[Person, float]], int]:
    """FTS search people by name. Returns ``(rows, total)``."""
    total = int(
        (
            await session.execute(
                text(
                    """
                    SELECT count(*)::int
                    FROM people
                    WHERE search_vector @@ plainto_tsquery('english', :q)
                    """
                ),
                {'q': query},
            )
        ).scalar_one()
    )
    result = await session.execute(
        text(
            """
            SELECT
                p.id,
                ts_rank(
                    p.search_vector,
                    plainto_tsquery('english', :q)
                ) AS rank
            FROM people p
            WHERE p.search_vector @@ plainto_tsquery('english', :q)
            ORDER BY rank DESC, p.name ASC
            LIMIT :limit OFFSET :offset
            """
        ),
        {'q': query, 'limit': limit, 'offset': offset},
    )
    people: list[tuple[Person, float]] = []
    for row in result.all():
        person = await session.get(Person, row.id)
        if person is None:
            continue
        people.append((person, float(row.rank or 0.0)))
    return people, total
