"""Metadata domain service: detail reads and DTO assembly."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.metadata import repository as metadata_repository
from app.metadata.images import InvalidImagePathError, tmdb_image_url
from app.metadata.models import ContentCredit, ContentItem, Person
from app.metadata.schemas import (
    CreditPersonRef,
    EpisodeDetail,
    MovieDetail,
    PersonCreditRef,
    PersonDetail,
    SeasonDetail,
    TvDetail,
)


class CatalogNotFoundError(Exception):
    """Requested catalog entity does not exist (or wrong type)."""


def _image_url(path: str | None, *, size: str = 'w500') -> str | None:
    """Build a CDN URL; skip invalid stored paths instead of failing the request."""
    try:
        return tmdb_image_url(path, size=size)
    except InvalidImagePathError:
        return None


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
        backdrop_url=_image_url(item.backdrop_path, size='w780'),
        popularity=item.popularity,
        release_date=item.movie.release_date,
        runtime_minutes=item.movie.runtime_minutes,
        status=item.movie.status,
        cast=cast_refs,
        crew=crew_refs,
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
        backdrop_url=_image_url(item.backdrop_path, size='w780'),
        popularity=item.popularity,
        first_air_date=item.tv_show.first_air_date,
        last_air_date=item.tv_show.last_air_date,
        status=item.tv_show.status,
        number_of_seasons=item.tv_show.number_of_seasons,
        number_of_episodes=item.tv_show.number_of_episodes,
        seasons=season_details,
        cast=cast_refs,
        crew=crew_refs,
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


async def get_movie_detail(
    session: AsyncSession,
    content_item_id: uuid.UUID,
) -> MovieDetail:
    """Load a movie detail DTO or raise :class:`CatalogNotFoundError`."""
    item = await metadata_repository.get_movie_by_id(session, content_item_id)
    if item is None or item.movie is None:
        raise CatalogNotFoundError('movie not found')
    return _movie_detail(item)


async def get_tv_detail(
    session: AsyncSession,
    content_item_id: uuid.UUID,
) -> TvDetail:
    """Load a TV detail DTO or raise :class:`CatalogNotFoundError`."""
    item = await metadata_repository.get_tv_by_id(session, content_item_id)
    if item is None or item.tv_show is None:
        raise CatalogNotFoundError('tv show not found')
    return _tv_detail(item)


async def get_person_detail(
    session: AsyncSession,
    person_id: uuid.UUID,
) -> PersonDetail:
    """Load a person detail DTO or raise :class:`CatalogNotFoundError`."""
    person = await metadata_repository.get_person_by_id(session, person_id)
    if person is None:
        raise CatalogNotFoundError('person not found')
    return _person_detail(person)
