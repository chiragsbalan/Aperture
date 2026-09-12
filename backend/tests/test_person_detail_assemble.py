"""Unit tests for hybrid person detail assemble (ADR-0017)."""

from __future__ import annotations

import inspect
import uuid
from types import SimpleNamespace

from app.metadata import person_detail as person_detail_mod
from app.metadata.person_detail import assemble_person_detail
from app.metadata.person_enrichment import MAX_KNOWN_FOR, pg_fallback_enrich_fields


def _person_with_credit(*, title: str = 'The Matrix') -> SimpleNamespace:
    content_id = uuid.uuid4()
    item = SimpleNamespace(
        id=content_id,
        content_type='movie',
        title=title,
        poster_path='/p.jpg',
        popularity=None,
        extras={},
        movie=SimpleNamespace(release_date=None, runtime_minutes=None),
        tv_show=None,
    )
    credit = SimpleNamespace(
        content_item=item,
        credit_kind='cast',
        character='Morpheus',
        job='',
    )
    return SimpleNamespace(
        id=uuid.uuid4(),
        name='Laurence Fishburne',
        biography='PG bio',
        birthday=None,
        deathday=None,
        place_of_birth='Augusta, Georgia',
        profile_path='/profile.jpg',
        credits=[credit],
    )


def test_assemble_uses_pg_filmography_when_enrich_empty() -> None:
    person = _person_with_credit()
    pg_fallback = pg_fallback_enrich_fields(person)  # type: ignore[arg-type]
    detail = assemble_person_detail(
        person,  # type: ignore[arg-type]
        enrich={
            'biography': 'Enrich bio',
            'known_for_department': 'Acting',
            'also_known_as': [],
            'socials': [],
            'known_for': [],
            'filmography': [],
        },
        pg_fallback=pg_fallback,
    )
    assert detail.biography == 'Enrich bio'
    assert detail.known_for_department == 'Acting'
    assert any(c.title == 'The Matrix' for c in detail.filmography)
    assert any(c.title == 'The Matrix' for c in detail.known_for)


def test_assemble_prefers_enrich_filmography_when_present() -> None:
    person = _person_with_credit(title='Local Only')
    pg_fallback = pg_fallback_enrich_fields(person)  # type: ignore[arg-type]
    detail = assemble_person_detail(
        person,  # type: ignore[arg-type]
        enrich={
            'biography': None,
            'filmography': [
                {
                    'type': 'movie',
                    'content_id': None,
                    'tmdb_id': 603,
                    'title': 'The Matrix',
                    'year': 1999,
                    'poster_url': None,
                    'credit_kind': 'cast',
                    'character': 'Morpheus',
                    'job': None,
                    'department': 'Acting',
                }
            ],
            'known_for': [
                {
                    'type': 'movie',
                    'content_id': None,
                    'tmdb_id': 603,
                    'title': 'The Matrix',
                    'year': 1999,
                    'poster_url': None,
                    'credit_kind': 'cast',
                    'character': 'Morpheus',
                    'job': None,
                    'department': 'Acting',
                }
            ],
            'also_known_as': [],
            'socials': [],
        },
        pg_fallback=pg_fallback,
    )
    assert detail.biography == 'PG bio'
    assert detail.filmography[0].title == 'The Matrix'
    assert detail.filmography[0].tmdb_id == 603
    assert all(c.title != 'Local Only' for c in detail.filmography)


def test_assemble_known_for_fallback_uses_max_known_for_not_twelve() -> None:
    person = _person_with_credit()
    pg_fallback = pg_fallback_enrich_fields(person)  # type: ignore[arg-type]
    filmography = [
        {
            'type': 'movie',
            'content_id': None,
            'tmdb_id': i + 1,
            'title': f'Title {i}',
            'year': 2000,
            'poster_url': None,
            'credit_kind': 'cast',
            'character': 'Role',
            'job': None,
            'department': 'Acting',
        }
        for i in range(MAX_KNOWN_FOR + 5)
    ]
    detail = assemble_person_detail(
        person,  # type: ignore[arg-type]
        enrich={
            'biography': None,
            'filmography': filmography,
            'known_for': [],
            'also_known_as': [],
            'socials': [],
        },
        pg_fallback=pg_fallback,
    )
    assert len(detail.known_for) == MAX_KNOWN_FOR
    assert MAX_KNOWN_FOR == 30
    source = inspect.getsource(person_detail_mod.assemble_person_detail)
    assert '[:12]' not in source
    assert 'MAX_KNOWN_FOR' in source
