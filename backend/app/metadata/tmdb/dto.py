"""Typed shapes for TMDb-like fixture / API payloads used by ingest."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TmdbCastCredit(BaseModel):
    """Cast member from a movie/TV credits block."""

    model_config = ConfigDict(extra='ignore')

    id: int
    name: str
    character: str = ''
    order: int | None = None
    profile_path: str | None = None


class TmdbCrewCredit(BaseModel):
    """Crew member from a movie/TV credits block."""

    model_config = ConfigDict(extra='ignore')

    id: int
    name: str
    job: str = ''
    department: str | None = None
    profile_path: str | None = None


class TmdbCredits(BaseModel):
    """Credits container."""

    model_config = ConfigDict(extra='ignore')

    cast: list[TmdbCastCredit] = Field(default_factory=list)
    crew: list[TmdbCrewCredit] = Field(default_factory=list)


class TmdbCreator(BaseModel):
    """TV ``created_by`` person stub from TMDb."""

    model_config = ConfigDict(extra='ignore')

    id: int
    name: str
    profile_path: str | None = None


class TmdbNetwork(BaseModel):
    """TV network / channel stub from TMDb."""

    model_config = ConfigDict(extra='ignore')

    id: int | None = None
    name: str
    origin_country: str | None = None


class TmdbEpisode(BaseModel):
    """Episode fixture row."""

    model_config = ConfigDict(extra='ignore')

    episode_number: int
    name: str | None = None
    overview: str | None = None
    air_date: str | None = None
    runtime: int | None = None
    still_path: str | None = None


class TmdbSeason(BaseModel):
    """Season fixture row with optional nested episodes."""

    model_config = ConfigDict(extra='ignore')

    season_number: int
    name: str | None = None
    overview: str | None = None
    air_date: str | None = None
    episode_count: int | None = None
    poster_path: str | None = None
    episodes: list[TmdbEpisode] = Field(default_factory=list)


class TmdbMovie(BaseModel):
    """Movie fixture / detail payload."""

    model_config = ConfigDict(extra='ignore')

    id: int
    title: str
    original_title: str | None = None
    overview: str | None = None
    poster_path: str | None = None
    backdrop_path: str | None = None
    popularity: float | None = None
    release_date: str | None = None
    runtime: int | None = None
    status: str | None = None
    credits: TmdbCredits = Field(default_factory=TmdbCredits)
    extras: dict[str, Any] = Field(default_factory=dict)


class TmdbTvShow(BaseModel):
    """TV fixture / detail payload."""

    model_config = ConfigDict(extra='ignore')

    id: int
    name: str
    original_name: str | None = None
    overview: str | None = None
    poster_path: str | None = None
    backdrop_path: str | None = None
    popularity: float | None = None
    first_air_date: str | None = None
    last_air_date: str | None = None
    status: str | None = None
    number_of_seasons: int | None = None
    number_of_episodes: int | None = None
    episode_run_time: list[int] = Field(default_factory=list)
    created_by: list[TmdbCreator] = Field(default_factory=list)
    networks: list[TmdbNetwork] = Field(default_factory=list)
    credits: TmdbCredits = Field(default_factory=TmdbCredits)
    seasons: list[TmdbSeason] = Field(default_factory=list)
    extras: dict[str, Any] = Field(default_factory=dict)


class TmdbPerson(BaseModel):
    """Person fixture / detail payload."""

    model_config = ConfigDict(extra='ignore')

    id: int
    name: str
    biography: str | None = None
    birthday: str | None = None
    deathday: str | None = None
    place_of_birth: str | None = None
    profile_path: str | None = None


def parse_movie_list(raw: list[dict[str, Any]]) -> list[TmdbMovie]:
    """Parse a list of movie dicts."""
    return [TmdbMovie.model_validate(row) for row in raw]


def parse_tv_list(raw: list[dict[str, Any]]) -> list[TmdbTvShow]:
    """Parse a list of TV dicts."""
    return [TmdbTvShow.model_validate(row) for row in raw]


def parse_person_list(raw: list[dict[str, Any]]) -> list[TmdbPerson]:
    """Parse a list of person dicts."""
    return [TmdbPerson.model_validate(row) for row in raw]
