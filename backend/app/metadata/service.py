"""Metadata domain service: detail reads and DTO assembly."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cache
from app.core.config import Settings
from app.metadata import repository as metadata_repository
from app.metadata.cache_keys import movie_enrichment_key, tv_enrichment_key
from app.metadata.enrichment import (
    extras_need_live_enrichment,
    merge_enrichment_extras,
)
from app.metadata.images import InvalidImagePathError, tmdb_image_url
from app.metadata.models import ContentCredit, ContentItem, Person
from app.metadata.rate_limit import enforce_season_hydrate_rate_limit
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
    NowInTheatresResponse,
    PersonCreditRef,
    PersonDetail,
    ReleaseEvent,
    SeasonDetail,
    SimilarTitle,
    StudioRef,
    TitleExtras,
    TopMovie,
    TopMoviesResponse,
    TopTvShowsResponse,
    TvDetail,
    WatchProvider,
    WatchProviderRegion,
)
from app.metadata.tmdb.client import (
    TmdbClient,
    TmdbConfigError,
    TmdbNotFoundError,
    TmdbUnavailableError,
)
from app.metadata.stub_refresh import maybe_refresh_stale_stub
from app.metadata.tv_season_hydrate import hydrate_tv_season_episodes

logger = logging.getLogger(__name__)

# Per-process coalescing for concurrent hybrid enrichment fetches.
_enrich_flights: dict[tuple[str, uuid.UUID], asyncio.Future[dict[str, Any]]] = {}
_enrich_flights_lock = asyncio.Lock()

# Redis sentinel: TMDb enrich failed; skip live retry until short TTL expires.
_ENRICHMENT_NEGATIVE_SENTINEL = {'_neg': True}


def reset_enrichment_flights() -> None:
    """Clear in-flight enrichment coalescing (tests)."""
    _enrich_flights.clear()


class CatalogNotFoundError(Exception):
    """Requested catalog entity does not exist (or wrong type)."""


class CatalogUnavailableError(Exception):
    """Upstream catalog provider unavailable (e.g. TMDb outage)."""


class LandingPostersUnavailableError(Exception):
    """TMDb top-rated posters could not be fetched."""


class TopMoviesUnavailableError(Exception):
    """TMDb top-rated movie pool could not be fetched."""


class TopTvShowsUnavailableError(Exception):
    """TMDb top-rated TV pool could not be fetched."""


class NowInTheatresUnavailableError(Exception):
    """TMDb now-playing theatre pool could not be fetched."""


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


def _year_from_release_date(value: object) -> int | None:
    """Parse ``YYYY`` from a TMDb ``release_date`` string when present."""
    if not isinstance(value, str) or len(value) < 4:
        return None
    year_text = value[:4]
    if not year_text.isdigit():
        return None
    year = int(year_text)
    if year < 1870 or year > 2100:
        return None
    return year


def _home_rail_movie_from_row(row: dict[str, Any]) -> TopMovie | None:
    """Parse a TMDb movie list row into a home-rail card, or skip."""
    raw_id = row.get('id')
    if not isinstance(raw_id, int) or raw_id <= 0:
        return None
    title = row.get('title')
    if not isinstance(title, str) or not title.strip():
        return None
    url = _image_url(
        row.get('poster_path') if isinstance(row.get('poster_path'), str) else None,
        size='w500',
    )
    if url is None:
        return None
    return TopMovie(
        tmdb_id=raw_id,
        title=title.strip(),
        poster_url=url,
        year=_year_from_release_date(row.get('release_date')),
    )


def _home_rail_tv_from_row(row: dict[str, Any]) -> TopMovie | None:
    """Parse a TMDb TV list row into a home-rail card, or skip."""
    raw_id = row.get('id')
    if not isinstance(raw_id, int) or raw_id <= 0:
        return None
    title = row.get('name')
    if not isinstance(title, str) or not title.strip():
        return None
    url = _image_url(
        row.get('poster_path') if isinstance(row.get('poster_path'), str) else None,
        size='w500',
    )
    if url is None:
        return None
    return TopMovie(
        tmdb_id=raw_id,
        title=title.strip(),
        poster_url=url,
        year=_year_from_release_date(row.get('first_air_date')),
    )


def _row_popularity(row: dict[str, Any]) -> float:
    value = row.get('popularity')
    if isinstance(value, (int, float)):
        return float(value)
    return 0.0


async def fetch_top_movies_pool(
    settings: Settings,
    *,
    count: int | None = None,
    client: TmdbClient | None = None,
) -> TopMoviesResponse:
    """Return TMDb all-time top-rated movies for the home rail pool.

    Does not touch Postgres — cards link via ``/movies/tmdb/{id}``. Raises
    :class:`TopMoviesUnavailableError` when TMDb is misconfigured or down.
    """
    limit = count if count is not None else settings.top_movies_pool_count
    if limit < 1:
        return TopMoviesResponse(movies=[])

    try:
        tmdb = client or TmdbClient.from_settings(settings)
    except TmdbConfigError as exc:
        raise TopMoviesUnavailableError(str(exc)) from exc

    movies: list[TopMovie] = []
    page = 1
    max_pages = max(1, (limit + 19) // 20)
    try:
        while len(movies) < limit and page <= max_pages:
            payload = await tmdb.get_movie_top_rated(page=page)
            results = payload.get('results')
            if not isinstance(results, list) or not results:
                break
            for row in results:
                if not isinstance(row, dict):
                    continue
                card = _home_rail_movie_from_row(row)
                if card is None:
                    continue
                movies.append(card)
                if len(movies) >= limit:
                    break
            page += 1
    except TmdbUnavailableError as exc:
        raise TopMoviesUnavailableError(str(exc)) from exc

    return TopMoviesResponse(movies=movies)


async def fetch_top_tv_shows_pool(
    settings: Settings,
    *,
    count: int | None = None,
    client: TmdbClient | None = None,
) -> TopTvShowsResponse:
    """Return TMDb all-time top-rated TV shows for the home rail pool."""
    limit = count if count is not None else settings.top_movies_pool_count
    if limit < 1:
        return TopTvShowsResponse(shows=[])

    try:
        tmdb = client or TmdbClient.from_settings(settings)
    except TmdbConfigError as exc:
        raise TopTvShowsUnavailableError(str(exc)) from exc

    shows: list[TopMovie] = []
    page = 1
    max_pages = max(1, (limit + 19) // 20)
    try:
        while len(shows) < limit and page <= max_pages:
            payload = await tmdb.get_tv_top_rated(page=page)
            results = payload.get('results')
            if not isinstance(results, list) or not results:
                break
            for row in results:
                if not isinstance(row, dict):
                    continue
                card = _home_rail_tv_from_row(row)
                if card is None:
                    continue
                shows.append(card)
                if len(shows) >= limit:
                    break
            page += 1
    except TmdbUnavailableError as exc:
        raise TopTvShowsUnavailableError(str(exc)) from exc

    return TopTvShowsResponse(shows=shows)


async def fetch_now_in_theatres_pool(
    settings: Settings,
    *,
    count: int | None = None,
    client: TmdbClient | None = None,
) -> NowInTheatresResponse:
    """Return TMDb now-playing movies, most popular first, for the home rail."""
    limit = count if count is not None else settings.now_in_theatres_pool_count
    if limit < 1:
        return NowInTheatresResponse(movies=[])

    try:
        tmdb = client or TmdbClient.from_settings(settings)
    except TmdbConfigError as exc:
        raise NowInTheatresUnavailableError(str(exc)) from exc

    scored: list[tuple[float, TopMovie]] = []
    page = 1
    max_pages = max(1, (limit + 19) // 20)
    try:
        while page <= max_pages:
            payload = await tmdb.get_movie_now_playing(page=page)
            results = payload.get('results')
            if not isinstance(results, list) or not results:
                break
            for row in results:
                if not isinstance(row, dict):
                    continue
                card = _home_rail_movie_from_row(row)
                if card is None:
                    continue
                scored.append((_row_popularity(row), card))
            total_pages = payload.get('total_pages')
            if isinstance(total_pages, int) and page >= total_pages:
                break
            page += 1
    except TmdbUnavailableError as exc:
        raise NowInTheatresUnavailableError(str(exc)) from exc

    scored.sort(key=lambda item: item[0], reverse=True)
    movies = [card for _, card in scored[:limit]]
    return NowInTheatresResponse(movies=movies)


def _title_extras(raw: dict[str, Any] | None) -> TitleExtras:
    """Map stored JSONB extras into API DTOs with resolved image URLs."""
    doc: dict[str, Any] = raw if isinstance(raw, dict) else {}
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
        networks=[
            StudioRef(
                id=n.get('id'),
                name=str(n['name']),
                origin_country=n.get('origin_country'),
            )
            for n in doc.get('networks', [])
            if isinstance(n, dict) and n.get('name')
        ],
        episode_runtime_minutes=(
            int(doc['episode_runtime_minutes'])
            if isinstance(doc.get('episode_runtime_minutes'), (int, float))
            and int(doc['episode_runtime_minutes']) > 0
            else None
        ),
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
        # Gallery / video extras are unused by the product UI — omit from the
        # public detail payload to cut JSON size (still stored in extras JSONB).
        videos=[],
        images=MediaGallery(),
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
    if not extras.similar:
        return
    external_ids = [str(item.tmdb_id) for item in extras.similar]
    mappings = await metadata_repository.get_external_ids_by_external(
        session,
        source='tmdb',
        source_namespace=source_namespace,
        external_ids=external_ids,
    )
    for item in extras.similar:
        mapping = mappings.get(str(item.tmdb_id))
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


def _movie_detail(
    item: ContentItem,
    *,
    extras_doc: dict[str, Any] | None = None,
) -> MovieDetail:
    assert item.movie is not None
    cast_refs, crew_refs = _credit_refs(list(item.credits))
    raw_extras = extras_doc if extras_doc is not None else item.extras
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
        extras=_title_extras(raw_extras),
    )


def _episode_details(episodes: list[Any]) -> list[EpisodeDetail]:
    ordered = sorted(episodes, key=lambda e: e.episode_number)
    return [
        EpisodeDetail(
            id=episode.id,
            episode_number=episode.episode_number,
            name=episode.name,
            overview=episode.overview,
            air_date=episode.air_date,
            runtime_minutes=episode.runtime_minutes,
            still_url=_image_url(episode.still_path),
        )
        for episode in ordered
    ]


def _preferred_embed_season_number(seasons: list[Any]) -> int | None:
    """Prefer Season 1; else first regular season; else first stub (incl. specials)."""
    if not seasons:
        return None
    by_number = {int(s.season_number): s for s in seasons}
    if 1 in by_number:
        return 1
    regular = sorted(
        (s for s in seasons if int(s.season_number) >= 1),
        key=lambda s: int(s.season_number),
    )
    if regular:
        return int(regular[0].season_number)
    return int(sorted(seasons, key=lambda s: int(s.season_number))[0].season_number)


def _season_detail(
    season: Any,
    *,
    include_episodes: bool,
    episodes: list[Any] | None = None,
) -> SeasonDetail:
    episode_rows = episodes if episodes is not None else list(season.episodes)
    return SeasonDetail(
        id=season.id,
        season_number=season.season_number,
        name=season.name,
        overview=season.overview,
        air_date=season.air_date,
        episode_count=season.episode_count,
        poster_url=_image_url(season.poster_path),
        episodes=_episode_details(episode_rows) if include_episodes else [],
    )


def _tv_detail(
    item: ContentItem,
    *,
    embed_season_number: int | None,
    embed_episodes: list[Any],
    extras_doc: dict[str, Any] | None = None,
) -> TvDetail:
    assert item.tv_show is not None
    cast_refs, crew_refs = _credit_refs(list(item.credits))
    seasons = sorted(item.tv_show.seasons, key=lambda s: s.season_number)
    season_details = [
        _season_detail(
            season,
            include_episodes=(
                embed_season_number is not None
                and season.season_number == embed_season_number
            ),
            episodes=(
                embed_episodes
                if (
                    embed_season_number is not None
                    and season.season_number == embed_season_number
                )
                else None
            ),
        )
        for season in seasons
    ]
    raw_extras = extras_doc if extras_doc is not None else item.extras
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
        extras=_title_extras(raw_extras),
    )


async def _coalesce_enrichment(
    key: tuple[str, uuid.UUID],
    leader_work: Callable[[], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    """Run one enrichment fetch per content id; waiters share the result."""
    loop = asyncio.get_running_loop()
    async with _enrich_flights_lock:
        existing = _enrich_flights.get(key)
        if existing is not None:
            waiter: asyncio.Future[dict[str, Any]] = existing
            is_leader = False
        else:
            waiter = loop.create_future()
            _enrich_flights[key] = waiter
            is_leader = True

    if not is_leader:
        return await asyncio.shield(waiter)

    try:
        extras = await leader_work()
    except BaseException as exc:
        if not waiter.done():
            waiter.set_exception(exc)
        raise
    else:
        if not waiter.done():
            waiter.set_result(extras)
        return extras
    finally:
        async with _enrich_flights_lock:
            if _enrich_flights.get(key) is waiter:
                del _enrich_flights[key]


async def _live_enrichment_extras(
    session: AsyncSession,
    *,
    content_item_id: uuid.UUID,
    source_namespace: str,
    settings: Settings,
) -> dict[str, Any] | None:
    """Fetch enrichment extras from TMDb; degrade to None on failure."""
    mapping = await metadata_repository.get_external_id_for_content(
        session,
        source='tmdb',
        source_namespace=source_namespace,
        content_item_id=content_item_id,
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

    async def _fetch() -> dict[str, Any]:
        try:
            if source_namespace == 'movie':
                return await client.get_movie_enrichment_extras(tmdb_id)
            return await client.get_tv_enrichment_extras(tmdb_id)
        except Exception as exc:
            # Degrade inside the flight so waiters get {} (not a shared
            # Future exception). Broad catch: TMDb outages and transport
            # oddities must not 500 detail.
            logger.info(
                'hybrid enrichment skipped for %s %s: %s',
                source_namespace,
                content_item_id,
                exc,
            )
            return {}

    live = await _coalesce_enrichment(
        (source_namespace, content_item_id),
        _fetch,
    )
    return live or None


def _enrichment_cache_key(
    content_item_id: uuid.UUID,
    *,
    source_namespace: str,
) -> str:
    if source_namespace == 'movie':
        return movie_enrichment_key(content_item_id)
    return tv_enrichment_key(content_item_id)


async def _cache_enrichment_doc(
    *,
    content_item_id: uuid.UUID,
    source_namespace: str,
    extras: dict[str, Any],
    settings: Settings,
) -> None:
    """Store enrichment JSON under a section key (longer TTL than full DTO)."""
    if not extras or extras.get('_neg'):
        return
    await get_cache().set(
        _enrichment_cache_key(content_item_id, source_namespace=source_namespace),
        json.dumps(extras, separators=(',', ':'), default=str),
        ttl_seconds=settings.metadata_enrichment_cache_ttl_seconds,
    )


async def _cache_enrichment_negative(
    *,
    content_item_id: uuid.UUID,
    source_namespace: str,
    settings: Settings,
) -> None:
    """Short-TTL sentinel so failed enrich does not stampede TMDb."""
    await get_cache().set(
        _enrichment_cache_key(content_item_id, source_namespace=source_namespace),
        json.dumps(_ENRICHMENT_NEGATIVE_SENTINEL, separators=(',', ':')),
        ttl_seconds=settings.metadata_enrichment_negative_cache_ttl_seconds,
    )


async def _load_cached_enrichment(
    *,
    content_item_id: uuid.UUID,
    source_namespace: str,
) -> dict[str, Any] | None:
    raw = await get_cache().get(
        _enrichment_cache_key(content_item_id, source_namespace=source_namespace),
    )
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _is_enrichment_negative(cached: dict[str, Any] | None) -> bool:
    return cached is not None and cached.get('_neg') is True


async def _resolve_extras_doc(
    session: AsyncSession,
    *,
    content_item_id: uuid.UUID,
    source_namespace: str,
    stored_extras: dict[str, Any] | None,
    settings: Settings | None,
    enrichment_extras: dict[str, Any] | None,
) -> dict[str, Any]:
    """Merge lean Postgres extras with section-cache / live enrichment."""
    base = stored_extras if isinstance(stored_extras, dict) else {}
    if enrichment_extras is not None:
        merged = merge_enrichment_extras(base, enrichment_extras)
        if settings is not None:
            await _cache_enrichment_doc(
                content_item_id=content_item_id,
                source_namespace=source_namespace,
                extras=merged,
                settings=settings,
            )
        return merged

    if settings is None:
        return base

    cached = await _load_cached_enrichment(
        content_item_id=content_item_id,
        source_namespace=source_namespace,
    )
    if _is_enrichment_negative(cached):
        # Negative hit: serve stub chrome only; skip live retry this request.
        return base
    if cached is not None and not extras_need_live_enrichment(cached):
        return merge_enrichment_extras(base, cached)

    if not extras_need_live_enrichment(base) and cached is None:
        # Legacy fat rows (pre-trim) can still serve without TMDb.
        return base

    live = await _live_enrichment_extras(
        session,
        content_item_id=content_item_id,
        source_namespace=source_namespace,
        settings=settings,
    )
    if live is None:
        await _cache_enrichment_negative(
            content_item_id=content_item_id,
            source_namespace=source_namespace,
            settings=settings,
        )
        return merge_enrichment_extras(base, cached) if cached else base
    merged = merge_enrichment_extras(base, live)
    await _cache_enrichment_doc(
        content_item_id=content_item_id,
        source_namespace=source_namespace,
        extras=merged,
        settings=settings,
    )
    return merged


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
    *,
    resolve_similar: bool = True,
    settings: Settings | None = None,
    enrichment_extras: dict[str, Any] | None = None,
) -> MovieDetail:
    """Load a movie detail DTO or raise :class:`CatalogNotFoundError`.

    Lean Postgres extras are merged with Redis/TMDb enrichment (providers /
    similar) when ``settings`` is provided and stored extras lack those
    sections. Pass ``enrichment_extras`` to skip a live TMDb round-trip (e.g.
    immediately after ingest).

    The write-through warm path after ingest uses ``resolve_similar=True`` so
    Similar titles are catalog-linked before the post-redirect detail GET.
    """
    item = await metadata_repository.get_movie_by_id(session, content_item_id)
    if item is None or item.movie is None:
        raise CatalogNotFoundError('movie not found')
    item = await maybe_refresh_stale_stub(
        session,
        item,
        source_namespace='movie',
        settings=settings,
    )
    if item.movie is None:
        raise CatalogNotFoundError('movie not found')
    extras_doc = await _resolve_extras_doc(
        session,
        content_item_id=content_item_id,
        source_namespace='movie',
        stored_extras=item.extras if isinstance(item.extras, dict) else {},
        settings=settings,
        enrichment_extras=enrichment_extras,
    )
    detail = _movie_detail(item, extras_doc=extras_doc)
    if resolve_similar:
        await _resolve_similar_catalog_ids(
            session,
            detail.extras,
            source_namespace='movie',
        )
    return detail


async def get_tv_detail(
    session: AsyncSession,
    content_item_id: uuid.UUID,
    *,
    resolve_similar: bool = True,
    settings: Settings | None = None,
    enrichment_extras: dict[str, Any] | None = None,
) -> TvDetail:
    """Load a TV detail DTO or raise :class:`CatalogNotFoundError`.

    Season stubs load without episodes; the preferred season (Season 1 when
    present) is loaded separately and embedded when rows already exist.
    Lean extras are hybrid-enriched like movies when ``settings`` is set.
    """
    item = await metadata_repository.get_tv_by_id(session, content_item_id)
    if item is None or item.tv_show is None:
        raise CatalogNotFoundError('tv show not found')
    item = await maybe_refresh_stale_stub(
        session,
        item,
        source_namespace='tv',
        settings=settings,
    )
    if item.tv_show is None:
        raise CatalogNotFoundError('tv show not found')
    seasons = list(item.tv_show.seasons)
    embed_number = _preferred_embed_season_number(seasons)
    embed_episodes: list[Any] = []
    if embed_number is not None:
        season_row = await metadata_repository.get_tv_season_by_number(
            session,
            content_item_id,
            embed_number,
        )
        if season_row is not None:
            embed_episodes = list(season_row.episodes)
    extras_doc = await _resolve_extras_doc(
        session,
        content_item_id=content_item_id,
        source_namespace='tv',
        stored_extras=item.extras if isinstance(item.extras, dict) else {},
        settings=settings,
        enrichment_extras=enrichment_extras,
    )
    detail = _tv_detail(
        item,
        embed_season_number=embed_number,
        embed_episodes=embed_episodes,
        extras_doc=extras_doc,
    )
    if resolve_similar:
        await _resolve_similar_catalog_ids(
            session,
            detail.extras,
            source_namespace='tv',
        )
    return detail


async def get_tv_season_detail(
    session: AsyncSession,
    content_item_id: uuid.UUID,
    season_number: int,
    *,
    settings: Settings,
    client_ip: str | None = None,
) -> SeasonDetail:
    """Return one season with full episodes for lazy title-page tab loads.

    When the season stub exists but episodes were never hydrated (cold
    stub-only resolve), fetch that season from TMDb on demand and persist.
    Upstream / config failures raise :class:`CatalogUnavailableError` (503)
    so clients can retry instead of caching an empty episode list.
    """
    season = await metadata_repository.get_tv_season_by_number(
        session,
        content_item_id,
        season_number,
    )
    if season is None:
        raise CatalogNotFoundError('tv season not found')
    if season.episodes or (season.episode_count or 0) <= 0:
        return _season_detail(season, include_episodes=True)

    await enforce_season_hydrate_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=client_ip,
    )

    try:
        client = TmdbClient.from_settings(settings)
    except TmdbConfigError as exc:
        raise CatalogUnavailableError(
            'Catalog temporarily unavailable',
        ) from exc

    try:
        season = await hydrate_tv_season_episodes(
            session,
            content_item_id=content_item_id,
            season_number=season_number,
            client=client,
        )
    except TmdbNotFoundError as exc:
        raise CatalogUnavailableError(
            'Catalog temporarily unavailable',
        ) from exc
    except TmdbUnavailableError as exc:
        raise CatalogUnavailableError(
            'Catalog temporarily unavailable',
        ) from exc
    except LookupError as exc:
        raise CatalogUnavailableError(
            'Catalog temporarily unavailable',
        ) from exc
    except RuntimeError as exc:
        raise CatalogUnavailableError(
            'Catalog temporarily unavailable',
        ) from exc

    if not season.episodes and (season.episode_count or 0) > 0:
        raise CatalogUnavailableError('Catalog temporarily unavailable')

    return _season_detail(season, include_episodes=True)


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
