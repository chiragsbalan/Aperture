"""Integration tests for fixture normalize + upsert idempotency."""

from __future__ import annotations

import asyncio
import uuid

import pytest
from app.core.db import dispose_db, init_db, session_scope
from app.metadata import repository as metadata_repository
from app.metadata.ingest import seed_from_fixtures
from app.metadata.models import ExternalId
from app.metadata.tmdb.client import TmdbClient, TmdbConfigError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError


async def _dispose() -> None:
    await dispose_db()


def _run(coro: object) -> object:
    """Run an async body on a fresh engine/loop (asyncpg is loop-bound)."""
    init_db()
    try:
        return asyncio.run(coro)  # type: ignore[arg-type]
    finally:
        asyncio.run(_dispose())


@pytest.mark.integration
def test_fixture_seed_is_idempotent() -> None:
    async def body() -> None:
        async with session_scope() as session:
            first = await seed_from_fixtures(session)
        assert first['movies'] >= 8
        assert first['tv_shows'] >= 4
        assert first['people'] >= 1

        async with session_scope() as session:
            before = await session.scalar(select(func.count()).select_from(ExternalId))
            second = await seed_from_fixtures(session)
            after = await session.scalar(select(func.count()).select_from(ExternalId))

        assert second == first
        assert before == after

        async with session_scope() as session:
            mapping = await metadata_repository.get_external_id(
                session,
                source='tmdb',
                source_namespace='movie',
                external_id='278',
            )
            assert mapping is not None
            assert mapping.content_item_id is not None
            assert mapping.person_id is None

            person_map = await metadata_repository.get_external_id(
                session,
                source='tmdb',
                source_namespace='person',
                external_id='192',
            )
            assert person_map is not None and person_map.person_id is not None
            person = await metadata_repository.get_person_by_id(
                session,
                person_map.person_id,
            )
            assert person is not None
            # Full people.json payload must survive credit-shell upserts.
            assert person.biography
            assert 'Morgan' in person.name

    _run(body())


@pytest.mark.integration
def test_external_id_xor_rejects_both_fks() -> None:
    """XOR CHECK: content_item and person cannot both be set."""
    from app.core.ids import new_uuid7

    async def body() -> None:
        async with session_scope() as session:
            item = await metadata_repository.upsert_movie(
                session,
                source='test',
                external_id=f'xor-movie-{uuid.uuid4().hex[:8]}',
                title='XOR Probe',
            )
            person = await metadata_repository.upsert_person(
                session,
                source='test',
                external_id=f'xor-person-{uuid.uuid4().hex[:8]}',
                name='XOR Person',
            )
            session.add(
                ExternalId(
                    id=new_uuid7(),
                    source='test',
                    source_namespace='probe',
                    external_id=f'xor-{uuid.uuid4().hex[:8]}',
                    entity_type='content_item',
                    content_item_id=item.id,
                    person_id=person.id,
                )
            )
            with pytest.raises(IntegrityError):
                await session.flush()
            await session.rollback()

    _run(body())


def test_trim_credits_retains_late_director() -> None:
    """Priority-ranked trim keeps Director even when it appears last."""
    from app.metadata.ingest import _trim_credits_for_resolve
    from app.metadata.tmdb.dto import (
        TmdbCastCredit,
        TmdbCredits,
        TmdbCrewCredit,
    )

    credits = TmdbCredits(
        cast=[
            TmdbCastCredit(id=i, name=f'Actor {i}', order=i) for i in range(25)
        ],
        crew=[
            *[
                TmdbCrewCredit(
                    id=i,
                    name=f'Producer {i}',
                    job='Executive Producer',
                )
                for i in range(15)
            ],
            TmdbCrewCredit(id=999, name='Late Director', job='Director'),
            TmdbCrewCredit(id=1000, name='Lighting', job='Gaffer'),
        ],
    )
    trimmed = _trim_credits_for_resolve(credits)
    assert len(trimmed.cast) == 20
    assert trimmed.cast[0].order == 0
    assert any(row.id == 999 and row.job == 'Director' for row in trimmed.crew)
    assert all(row.job != 'Gaffer' for row in trimmed.crew)
    assert len(trimmed.crew) <= 12
    assert trimmed.crew[0].job == 'Director'


def test_tmdb_client_requires_api_key() -> None:
    with pytest.raises(TmdbConfigError, match='TMDB_API_KEY'):
        TmdbClient('')


def test_tmdb_client_repr_hides_api_key() -> None:
    client = TmdbClient('super-secret-key-value')
    text = repr(client)
    assert 'super-secret-key-value' not in text
    assert 'api_key=***' in text


def test_fixtures_parse_without_network() -> None:
    """Committed fixtures are valid TMDb-like payloads (unit; no DB/network)."""
    from app.metadata.ingest import FIXTURES_DIR, _load_json
    from app.metadata.tmdb.dto import (
        parse_movie_list,
        parse_person_list,
        parse_tv_list,
    )

    movies = parse_movie_list(_load_json(FIXTURES_DIR / 'movies.json'))
    shows = parse_tv_list(_load_json(FIXTURES_DIR / 'tv.json'))
    people = parse_person_list(_load_json(FIXTURES_DIR / 'people.json'))
    assert 8 <= len(movies) <= 20
    assert 4 <= len(shows) <= 10
    assert len(people) >= 4
    assert movies[0].poster_path and movies[0].poster_path.startswith('/')
    assert '://' not in (movies[0].poster_path or '')
    assert any(c.credits.cast for c in movies)
