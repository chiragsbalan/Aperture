"""Metadata domain service: detail reads and DTO assembly."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.metadata import repository as metadata_repository
from app.metadata.images import InvalidImagePathError, tmdb_image_url
from app.metadata.models import ContentCredit, ContentItem, Person
from app.metadata.schemas import (
    AlternativeTitle,
    CollectionRef,
    CountryRef,
    CreditPersonRef,
    EpisodeDetail,
    LandingPoster,
    LandingPostersResponse,
    LanguageRef,
    MediaGallery,
    MovieDetail,
    NamedId,
    PersonCreditRef,
    PersonDetail,
    ReleaseEvent,
    SeasonDetail,
    SimilarTitle,
    StudioRef,
    TitleExtras,
    TvDetail,
    VideoRef,
    WatchProvider,
    WatchProviderRegion,
)
from app.metadata.tmdb.client import TmdbClient, TmdbConfigError, TmdbUnavailableError


class CatalogNotFoundError(Exception):
    """Requested catalog entity does not exist (or wrong type)."""


class LandingPostersUnavailableError(Exception):
    """TMDb top-rated posters could not be fetched."""


@dataclass(frozen=True, slots=True)
class ContentSummaryDTO:
    """Compact title card for list / library embeddings."""

    content_type: str
    id: uuid.UUID
    title: str
    year: int | None
    poster_url: str | None


def _image_url(path: str | None, *, size: str = 'w500') -> str | None:
    """Build a CDN URL; skip invalid stored paths instead of failing the request."""
    try:
        return tmdb_image_url(path, size=size)
    except InvalidImagePathError:
        return None


async def fetch_landing_top_posters(
    settings: Settings,
    *,
    count: int | None = None,
    client: TmdbClient | None = None,
) -> LandingPostersResponse:
    """Return TMDb all-time top-rated movie posters for the landing mosaic.

    Does not touch Postgres — posters are CDN URLs only. Raises
    :class:`LandingPostersUnavailableError` when TMDb is misconfigured or down.
    """
    limit = count if count is not None else settings.landing_posters_count
    if limit < 1:
        return LandingPostersResponse(posters=[])

    try:
        tmdb = client or TmdbClient.from_settings(settings)
    except TmdbConfigError as exc:
        raise LandingPostersUnavailableError(str(exc)) from exc

    posters: list[LandingPoster] = []
    page = 1
    # TMDb returns 20 results per page; cap pages so a bad response cannot loop.
    max_pages = max(1, (limit + 19) // 20)
    try:
        while len(posters) < limit and page <= max_pages:
            payload = await tmdb.get_movie_top_rated(page=page)
            results = payload.get('results')
            if not isinstance(results, list) or not results:
                break
            for row in results:
                if not isinstance(row, dict):
                    continue
                url = _image_url(
                    row.get('poster_path')
                    if isinstance(row.get('poster_path'), str)
                    else None,
                    # Small CDN size — mosaic tiles are intentionally tiny.
                    size='w154',
                )
                if url is None:
                    continue
                title = row.get('title')
                posters.append(
                    LandingPoster(
                        poster_url=url,
                        title=title if isinstance(title, str) else None,
                    )
                )
                if len(posters) >= limit:
                    break
            page += 1
    except TmdbUnavailableError as exc:
        raise LandingPostersUnavailableError(str(exc)) from exc

    return LandingPostersResponse(posters=posters)


def _title_extras(raw: dict[str, Any] | None) -> TitleExtras:
    """Map stored JSONB extras into API DTOs with resolved image URLs."""
    doc: dict[str, Any] = raw if isinstance(raw, dict) else {}
    images_raw: dict[str, Any] = (
        doc['images'] if isinstance(doc.get('images'), dict) else {}
    )
    collection_raw = (
        doc['collection'] if isinstance(doc.get('collection'), dict) else None
    )
    providers_raw: dict[str, Any] = (
        doc['watch_providers'] if isinstance(doc.get('watch_providers'), dict) else {}
    )
    providers: dict[str, WatchProviderRegion] = {}
    for region, block in providers_raw.items():
        if not isinstance(block, dict):
            continue

        def map_providers(rows: object) -> list[WatchProvider]:
            out: list[WatchProvider] = []
            if not isinstance(rows, list):
                return out
            for row in rows:
                if not isinstance(row, dict) or not row.get('provider_name'):
                    continue
                out.append(
                    WatchProvider(
                        provider_id=row.get('provider_id'),
                        provider_name=str(row['provider_name']),
                        logo_url=_image_url(row.get('logo_path'), size='w92'),
                        display_priority=row.get('display_priority'),
                    )
                )
            return out

        providers[str(region)] = WatchProviderRegion(
            link=block.get('link'),
            flatrate=map_providers(block.get('flatrate')),
            rent=map_providers(block.get('rent')),
            buy=map_providers(block.get('buy')),
            ads=map_providers(block.get('ads')),
            free=map_providers(block.get('free')),
        )

    return TitleExtras(
        tagline=doc.get('tagline'),
        original_language=doc.get('original_language'),
        budget=doc.get('budget'),
        revenue=doc.get('revenue'),
        collection=(
            CollectionRef(
                id=collection_raw.get('id'),
                name=str(collection_raw['name']),
                poster_url=_image_url(collection_raw.get('poster_path')),
            )
            if collection_raw and collection_raw.get('name')
            else None
        ),
        genres=[
            NamedId(id=g.get('id'), name=str(g['name']))
            for g in doc.get('genres', [])
            if isinstance(g, dict) and g.get('name')
        ],
        keywords=[
            NamedId(id=k.get('id'), name=str(k['name']))
            for k in doc.get('keywords', [])
            if isinstance(k, dict) and k.get('name')
        ],
        studios=[
            StudioRef(
                id=s.get('id'),
                name=str(s['name']),
                origin_country=s.get('origin_country'),
            )
            for s in doc.get('studios', [])
            if isinstance(s, dict) and s.get('name')
        ],
        countries=[
            CountryRef(
                iso_3166_1=str(c['iso_3166_1']),
                name=c.get('name'),
            )
            for c in doc.get('countries', [])
            if isinstance(c, dict) and c.get('iso_3166_1')
        ],
        spoken_languages=[
            LanguageRef(
                iso_639_1=lang.get('iso_639_1'),
                english_name=lang.get('english_name'),
                name=lang.get('name'),
            )
            for lang in doc.get('spoken_languages', [])
            if isinstance(lang, dict)
        ],
        alternative_titles=[
            AlternativeTitle(
                iso_3166_1=t.get('iso_3166_1'),
                title=str(t['title']),
                type=t.get('type'),
            )
            for t in doc.get('alternative_titles', [])
            if isinstance(t, dict) and t.get('title')
        ],
        releases=[
            ReleaseEvent(
                country=r.get('country'),
                release_date=r.get('release_date'),
                type=r.get('type'),
                certification=r.get('certification'),
                note=r.get('note'),
            )
            for r in doc.get('releases', [])
            if isinstance(r, dict)
        ],
        videos=[
            VideoRef(
                key=str(v['key']),
                name=v.get('name'),
                site=str(v.get('site') or 'YouTube'),
                type=v.get('type'),
                official=bool(v.get('official')),
            )
            for v in doc.get('videos', [])
            if isinstance(v, dict) and v.get('key')
        ],
        images=MediaGallery(
            backdrops=[
                url
                for path in images_raw.get('backdrops', [])
                if isinstance(path, str)
                for url in [_image_url(path, size='w780')]
                if url
            ],
            posters=[
                url
                for path in images_raw.get('posters', [])
                if isinstance(path, str)
                for url in [_image_url(path, size='w500')]
                if url
            ],
        ),
        watch_providers=providers,
        similar=[
            SimilarTitle(
                tmdb_id=int(row['tmdb_id']),
                title=str(row['title']),
                year=row.get('year'),
                poster_url=_image_url(
                    row['poster_path']
                    if isinstance(row.get('poster_path'), str)
                    else None,
                    size='w342',
                ),
            )
            for row in doc.get('similar', [])
            if isinstance(row, dict) and row.get('tmdb_id') and row.get('title')
        ],
    )


async def _resolve_similar_catalog_ids(
    session: AsyncSession,
    extras: TitleExtras,
    *,
    source_namespace: str,
) -> None:
    """Attach Aperture content ids when recommended titles exist in-catalog."""
    content_type = 'movie' if source_namespace == 'movie' else 'tv_show'
    for item in extras.similar:
        mapping = await metadata_repository.get_external_id(
            session,
            source='tmdb',
            source_namespace=source_namespace,
            external_id=str(item.tmdb_id),
        )
        if mapping is not None and mapping.content_item_id is not None:
            item.content_id = mapping.content_item_id
            item.content_type = content_type


def _credit_refs(
    credits: list[ContentCredit],
) -> tuple[
    list[CreditPersonRef],
    list[CreditPersonRef],
]:
    cast_refs: list[CreditPersonRef] = []
    crew_refs: list[CreditPersonRef] = []
    for credit in sorted(
        credits,
        key=lambda c: (
            c.billing_order is None,
            c.billing_order if c.billing_order is not None else 0,
            c.person.name,
        ),
    ):
        ref = CreditPersonRef(
            type='person',
            id=credit.person_id,
            name=credit.person.name,
            profile_url=_image_url(credit.person.profile_path, size='w185'),
            character=credit.character or None,
            job=credit.job or None,
            billing_order=credit.billing_order,
        )
        if credit.credit_kind == 'cast':
            cast_refs.append(ref)
        else:
            crew_refs.append(ref)
    return cast_refs, crew_refs


def _movie_detail(item: ContentItem) -> MovieDetail:
    assert item.movie is not None
    cast_refs, crew_refs = _credit_refs(list(item.credits))
    return MovieDetail(
        type='movie',
        id=item.id,
        title=item.title,
        original_title=item.original_title,
        overview=item.overview,
        poster_url=_image_url(item.poster_path),
        backdrop_url=_image_url(item.backdrop_path, size='original'),
        popularity=item.popularity,
        release_date=item.movie.release_date,
        runtime_minutes=item.movie.runtime_minutes,
        status=item.movie.status,
        cast=cast_refs,
        crew=crew_refs,
        extras=_title_extras(item.extras),
    )


def _tv_detail(item: ContentItem) -> TvDetail:
    assert item.tv_show is not None
    cast_refs, crew_refs = _credit_refs(list(item.credits))
    seasons = sorted(item.tv_show.seasons, key=lambda s: s.season_number)
    season_details: list[SeasonDetail] = []
    for season in seasons:
        episodes = sorted(season.episodes, key=lambda e: e.episode_number)
        season_details.append(
            SeasonDetail(
                id=season.id,
                season_number=season.season_number,
                name=season.name,
                overview=season.overview,
                air_date=season.air_date,
                episode_count=season.episode_count,
                poster_url=_image_url(season.poster_path),
                episodes=[
                    EpisodeDetail(
                        id=episode.id,
                        episode_number=episode.episode_number,
                        name=episode.name,
                        overview=episode.overview,
                        air_date=episode.air_date,
                        runtime_minutes=episode.runtime_minutes,
                        still_url=_image_url(episode.still_path),
                    )
                    for episode in episodes
                ],
            )
        )
    return TvDetail(
        type='tv_show',
        id=item.id,
        title=item.title,
        original_title=item.original_title,
        overview=item.overview,
        poster_url=_image_url(item.poster_path),
        backdrop_url=_image_url(item.backdrop_path, size='original'),
        popularity=item.popularity,
        first_air_date=item.tv_show.first_air_date,
        last_air_date=item.tv_show.last_air_date,
        status=item.tv_show.status,
        number_of_seasons=item.tv_show.number_of_seasons,
        number_of_episodes=item.tv_show.number_of_episodes,
        seasons=season_details,
        cast=cast_refs,
        crew=crew_refs,
        extras=_title_extras(item.extras),
    )


def _person_detail(person: Person) -> PersonDetail:
    credit_refs: list[PersonCreditRef] = []
    for credit in person.credits:
        item = credit.content_item
        credit_refs.append(
            PersonCreditRef(
                type='movie' if item.content_type == 'movie' else 'tv_show',
                id=item.id,
                title=item.title,
                poster_url=_image_url(item.poster_path),
                credit_kind=credit.credit_kind,
                character=credit.character or None,
                job=credit.job or None,
            )
        )
    credit_refs.sort(key=lambda c: (c.title.lower(), c.credit_kind))
    return PersonDetail(
        type='person',
        id=person.id,
        name=person.name,
        biography=person.biography,
        birthday=person.birthday,
        deathday=person.deathday,
        place_of_birth=person.place_of_birth,
        profile_url=_image_url(person.profile_path, size='h632'),
        credits=credit_refs,
    )


def _content_year(item: ContentItem) -> int | None:
    if item.movie is not None and item.movie.release_date is not None:
        return item.movie.release_date.year
    if item.tv_show is not None and item.tv_show.first_air_date is not None:
        return item.tv_show.first_air_date.year
    return None


async def content_exists(
    session: AsyncSession,
    *,
    content_type: str,
    content_id: uuid.UUID,
) -> bool:
    """Return True when a catalog title exists for the type + id."""
    return await metadata_repository.content_item_exists(
        session,
        content_type=content_type,
        content_id=content_id,
    )


async def get_content_summaries(
    session: AsyncSession,
    *,
    refs: list[tuple[str, uuid.UUID]],
) -> list[ContentSummaryDTO]:
    """Batch-load compact summaries for ``(db_content_type, id)`` refs."""
    items = await metadata_repository.get_content_items_by_refs(
        session,
        refs=refs,
    )
    return [
        ContentSummaryDTO(
            content_type=item.content_type,
            id=item.id,
            title=item.title,
            year=_content_year(item),
            poster_url=_image_url(item.poster_path),
        )
        for item in items
    ]


async def get_movie_detail(
    session: AsyncSession,
    content_item_id: uuid.UUID,
) -> MovieDetail:
    """Load a movie detail DTO or raise :class:`CatalogNotFoundError`."""
    item = await metadata_repository.get_movie_by_id(session, content_item_id)
    if item is None or item.movie is None:
        raise CatalogNotFoundError('movie not found')
    detail = _movie_detail(item)
    await _resolve_similar_catalog_ids(
        session,
        detail.extras,
        source_namespace='movie',
    )
    return detail


async def get_tv_detail(
    session: AsyncSession,
    content_item_id: uuid.UUID,
) -> TvDetail:
    """Load a TV detail DTO or raise :class:`CatalogNotFoundError`."""
    item = await metadata_repository.get_tv_by_id(session, content_item_id)
    if item is None or item.tv_show is None:
        raise CatalogNotFoundError('tv show not found')
    detail = _tv_detail(item)
    await _resolve_similar_catalog_ids(
        session,
        detail.extras,
        source_namespace='tv',
    )
    return detail


async def get_person_detail(
    session: AsyncSession,
    person_id: uuid.UUID,
) -> PersonDetail:
    """Load a person detail DTO or raise :class:`CatalogNotFoundError`."""
    person = await metadata_repository.get_person_by_id(session, person_id)
    if person is None:
        raise CatalogNotFoundError('person not found')
    return _person_detail(person)


async def search_catalog(
    session: AsyncSession,
    *,
    query: str,
    types: frozenset[str],
    page: int,
    limit: int,
) -> tuple[list[dict[str, object]], int]:
    """Run PG FTS across requested catalog types.

    ``types`` uses public API values: ``movie``, ``tv``, ``person``.
    Returns ``(hit dicts, total)`` ordered by rank (mixed when multiple types).
    """
    offset = (page - 1) * limit
    db_types: set[str] = set()
    if 'movie' in types:
        db_types.add('movie')
    if 'tv' in types:
        db_types.add('tv_show')

    hits: list[tuple[float, dict[str, object]]] = []
    total = 0

    if db_types:
        # Fetch a wider window so mixed ranking across people works at seed scale.
        fetch_limit = offset + limit
        content_rows, content_total = await metadata_repository.search_content_items(
            session,
            query=query,
            content_types=frozenset(db_types),
            limit=fetch_limit,
            offset=0,
        )
        total += content_total
        for item, rank, year in content_rows:
            public_type = 'movie' if item.content_type == 'movie' else 'tv'
            hits.append(
                (
                    rank,
                    {
                        'type': public_type,
                        'id': item.id,
                        'title': item.title,
                        'year': year,
                        'poster_url': _image_url(item.poster_path),
                        'rank': rank,
                    },
                )
            )

    if 'person' in types:
        fetch_limit = offset + limit
        people_rows, people_total = await metadata_repository.search_people(
            session,
            query=query,
            limit=fetch_limit,
            offset=0,
        )
        total += people_total
        for person, rank in people_rows:
            hits.append(
                (
                    rank,
                    {
                        'type': 'person',
                        'id': person.id,
                        'title': person.name,
                        'year': None,
                        'poster_url': _image_url(person.profile_path, size='w185'),
                        'rank': rank,
                    },
                )
            )

    hits.sort(key=lambda row: (-row[0], str(row[1]['title']).lower()))
    page_hits = [row[1] for row in hits[offset : offset + limit]]
    return page_hits, total
