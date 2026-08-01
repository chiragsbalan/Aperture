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
