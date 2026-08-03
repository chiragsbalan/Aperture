"""Public detail DTOs for movies, TV shows, and people."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CreditPersonRef(BaseModel):
    """Person stub embedded in cast/crew lists."""

    model_config = ConfigDict(from_attributes=True)

    type: str = Field(default='person', examples=['person'])
    id: uuid.UUID
    name: str
    profile_url: str | None = None
    character: str | None = None
    job: str | None = None
    billing_order: int | None = None


class EpisodeDetail(BaseModel):
    """Episode row for TV detail."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    episode_number: int
    name: str | None = None
    overview: str | None = None
    air_date: date | None = None
    runtime_minutes: int | None = None
    still_url: str | None = None


class SeasonDetail(BaseModel):
    """Season + nested episodes for TV detail."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    season_number: int
    name: str | None = None
    overview: str | None = None
    air_date: date | None = None
    episode_count: int | None = None
    poster_url: str | None = None
    episodes: list[EpisodeDetail] = Field(default_factory=list)


class NamedId(BaseModel):
    """Genre / keyword / studio stub."""

    id: int | None = None
    name: str


class StudioRef(BaseModel):
    """Production company."""

    id: int | None = None
    name: str
    origin_country: str | None = None


class CountryRef(BaseModel):
    """Production country."""

    iso_3166_1: str
    name: str | None = None


class LanguageRef(BaseModel):
    """Spoken / original language."""

    iso_639_1: str | None = None
    english_name: str | None = None
    name: str | None = None


class AlternativeTitle(BaseModel):
    """Localized / alternate title."""

    iso_3166_1: str | None = None
    title: str
    type: str | None = None


class ReleaseEvent(BaseModel):
    """Country release / rating row."""

    country: str | None = None
    release_date: str | None = None
    type: int | None = None
    certification: str | None = None
    note: str | None = None


class VideoRef(BaseModel):
    """YouTube trailer / clip."""

    key: str
    name: str | None = None
    site: str = 'YouTube'
    type: str | None = None
    official: bool = False


class MediaGallery(BaseModel):
    """Backdrop / poster gallery URLs."""

    backdrops: list[str] = Field(default_factory=list)
    posters: list[str] = Field(default_factory=list)


class WatchProvider(BaseModel):
    """Streaming / rent / buy provider."""

    provider_id: int | None = None
    provider_name: str
    logo_url: str | None = None
    display_priority: int | None = None


class WatchProviderRegion(BaseModel):
    """Providers for one ISO country."""

    link: str | None = None
    flatrate: list[WatchProvider] = Field(default_factory=list)
    rent: list[WatchProvider] = Field(default_factory=list)
    buy: list[WatchProvider] = Field(default_factory=list)
    ads: list[WatchProvider] = Field(default_factory=list)
    free: list[WatchProvider] = Field(default_factory=list)


class CollectionRef(BaseModel):
    """Optional franchise / collection."""

    id: int | None = None
    name: str
    poster_url: str | None = None


class SimilarTitle(BaseModel):
    """Recommended / similar title card."""

    tmdb_id: int
    title: str
    year: int | None = None
    poster_url: str | None = None
    content_id: uuid.UUID | None = None
    content_type: str | None = None


class LandingPoster(BaseModel):
    """Decorative poster tile for the logged-out landing mosaic."""

    poster_url: str
    title: str | None = None


class LandingPostersResponse(BaseModel):
    """Shared TMDb top-rated poster set for landing / auth shells."""

    posters: list[LandingPoster] = Field(default_factory=list)


class TopMovie(BaseModel):
    """Clickable TMDb top-rated movie card for the signed-in home rail."""

    tmdb_id: int
    title: str
    poster_url: str
    year: int | None = None


class TopMoviesResponse(BaseModel):
    """Shuffled sample from the cached TMDb top-100 set."""

    movies: list[TopMovie] = Field(default_factory=list)


class ResolveByTmdbRequest(BaseModel):
    """Resolve (and optionally ingest) a title by TMDb id."""

    tmdb_id: int = Field(gt=0)


class ResolveByTmdbResponse(BaseModel):
    """Canonical catalog pointer after resolve."""

    id: uuid.UUID
    type: str


class TitleExtras(BaseModel):
    """Enrichment shown on detail tabs / watch / more-like-this."""

    tagline: str | None = None
    original_language: str | None = None
    budget: int | None = None
    revenue: int | None = None
    collection: CollectionRef | None = None
    genres: list[NamedId] = Field(default_factory=list)
    keywords: list[NamedId] = Field(default_factory=list)
    studios: list[StudioRef] = Field(default_factory=list)
    networks: list[StudioRef] = Field(default_factory=list)
    episode_runtime_minutes: int | None = None
    countries: list[CountryRef] = Field(default_factory=list)
    spoken_languages: list[LanguageRef] = Field(default_factory=list)
    alternative_titles: list[AlternativeTitle] = Field(default_factory=list)
    releases: list[ReleaseEvent] = Field(default_factory=list)
    videos: list[VideoRef] = Field(default_factory=list)
    images: MediaGallery = Field(default_factory=MediaGallery)
    watch_providers: dict[str, WatchProviderRegion] = Field(default_factory=dict)
    similar: list[SimilarTitle] = Field(default_factory=list)


class MovieDetail(BaseModel):
    """Curated movie detail response."""

    model_config = ConfigDict(from_attributes=True)

    type: str = Field(default='movie', examples=['movie'])
    id: uuid.UUID
    title: str
    original_title: str | None = None
    overview: str | None = None
    poster_url: str | None = None
    backdrop_url: str | None = None
    popularity: Decimal | None = None
    release_date: date | None = None
    runtime_minutes: int | None = None
    status: str | None = None
    cast: list[CreditPersonRef] = Field(default_factory=list)
    crew: list[CreditPersonRef] = Field(default_factory=list)
    extras: TitleExtras = Field(default_factory=TitleExtras)


class TvDetail(BaseModel):
    """Curated TV-show detail response."""

    model_config = ConfigDict(from_attributes=True)

    type: str = Field(default='tv_show', examples=['tv_show'])
    id: uuid.UUID
    title: str
    original_title: str | None = None
    overview: str | None = None
    poster_url: str | None = None
    backdrop_url: str | None = None
    popularity: Decimal | None = None
    first_air_date: date | None = None
    last_air_date: date | None = None
    status: str | None = None
    number_of_seasons: int | None = None
    number_of_episodes: int | None = None
    seasons: list[SeasonDetail] = Field(default_factory=list)
    cast: list[CreditPersonRef] = Field(default_factory=list)
    crew: list[CreditPersonRef] = Field(default_factory=list)
    extras: TitleExtras = Field(default_factory=TitleExtras)


class PersonCreditRef(BaseModel):
    """Content stub on a person detail page."""

    model_config = ConfigDict(from_attributes=True)

    type: str
    id: uuid.UUID
    title: str
    poster_url: str | None = None
    credit_kind: str
    character: str | None = None
    job: str | None = None


class PersonDetail(BaseModel):
    """Curated person detail response."""

    model_config = ConfigDict(from_attributes=True)

    type: str = Field(default='person', examples=['person'])
    id: uuid.UUID
    name: str
    biography: str | None = None
    birthday: date | None = None
    deathday: date | None = None
    place_of_birth: str | None = None
    profile_url: str | None = None
    credits: list[PersonCreditRef] = Field(default_factory=list)
