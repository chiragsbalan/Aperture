"""Unit tests for person enrich curation (ADR-0017)."""

from __future__ import annotations

from app.metadata.person_enrichment import (
    DEPARTMENT_PRECEDENCE,
    MAX_ALSO_KNOWN_AS,
    MAX_FILMOGRAPHY,
    MAX_KNOWN_FOR,
    also_known_as_capped,
    curate_combined_credits,
    enrich_doc_from_tmdb_payload,
    homepage_social,
    select_known_for,
    social_link_from_parts,
    socials_from_external_ids,
)
from app.metadata.schemas import PersonTitleCard, TitleRating


def test_max_known_for_is_thirty() -> None:
    assert MAX_KNOWN_FOR == 30


def test_department_precedence_order() -> None:
    assert DEPARTMENT_PRECEDENCE == (
        'Acting',
        'Directing',
        'Writing',
        'Production',
        'Editing',
        'Camera',
        'Sound',
        'Art',
        'Costume & Make-Up',
        'Visual Effects',
        'Lighting',
        'Creator',
        'Crew',
    )


def test_social_allowlist_rejects_http_and_unknown_hosts() -> None:
    assert (
        social_link_from_parts(
            kind='imdb',
            label='IMDb',
            url='http://www.imdb.com/name/nm0000001/',
        )
        is None
    )
    assert (
        social_link_from_parts(
            kind='imdb',
            label='IMDb',
            url='https://evil.example/name/nm0000001/',
        )
        is None
    )
    ok = social_link_from_parts(
        kind='imdb',
        label='IMDb',
        url='https://www.imdb.com/name/nm0000001/',
    )
    assert ok is not None
    assert ok.url.startswith('https://www.imdb.com/')


def test_homepage_rejects_localhost() -> None:
    assert homepage_social('https://localhost/bio') is None
    assert homepage_social('https://example.com/actor') is not None


def test_socials_from_external_ids_builds_allowlisted_chips() -> None:
    links = socials_from_external_ids(
        {
            'imdb_id': 'nm0000401',
            'instagram_id': '@laurence',
            'twitter_id': 'fishburne',
        },
        homepage='https://example.com/',
    )
    kinds = {link.kind for link in links}
    assert kinds == {'imdb', 'instagram', 'x', 'homepage'}


def _cast_row(
    *,
    tmdb_id: int,
    title: str,
    popularity: float,
    vote_average: float | None = None,
    vote_count: int | None = None,
    release_date: str = '2000-01-01',
) -> dict:
    row: dict = {
        'id': tmdb_id,
        'media_type': 'movie',
        'title': title,
        'popularity': popularity,
        'release_date': release_date,
        'adult': False,
        'character': 'Role',
    }
    if vote_average is not None:
        row['vote_average'] = vote_average
    if vote_count is not None:
        row['vote_count'] = vote_count
    return row


def _crew_row(
    *,
    tmdb_id: int,
    title: str,
    popularity: float,
    department: str,
    job: str,
    vote_average: float | None = None,
    vote_count: int | None = None,
    release_date: str = '2000-01-01',
) -> dict:
    row: dict = {
        'id': tmdb_id,
        'media_type': 'movie',
        'title': title,
        'popularity': popularity,
        'release_date': release_date,
        'adult': False,
        'department': department,
        'job': job,
    }
    if vote_average is not None:
        row['vote_average'] = vote_average
    if vote_count is not None:
        row['vote_count'] = vote_count
    return row


def test_curate_drops_adult_and_episode_rows_and_caps() -> None:
    cast = []
    for i in range(200):
        cast.append(
            _cast_row(
                tmdb_id=i + 1,
                title=f'Movie {i}',
                popularity=float(200 - i),
            )
        )
    cast.append(
        {
            'id': 9999,
            'media_type': 'movie',
            'title': 'Adult title',
            'popularity': 9999.0,
            'adult': True,
            'character': 'X',
        }
    )
    cast.append(
        {
            'id': 8888,
            'media_type': 'tv',
            'name': '',
            'episode_id': 12,
            'season_number': 1,
            'popularity': 9998.0,
            'character': 'Guest',
        }
    )
    known_for, filmography = curate_combined_credits({'cast': cast, 'crew': []})
    assert len(known_for) <= MAX_KNOWN_FOR
    unique_titles = {(c.type, c.tmdb_id) for c in filmography}
    assert len(unique_titles) <= MAX_FILMOGRAPHY
    titles = {c.title for c in filmography}
    assert 'Adult title' not in titles
    assert all(c.tmdb_id != 8888 for c in filmography)
    # Highest popularity non-adult first.
    assert filmography[0].title == 'Movie 0'


def test_curate_keeps_directing_and_acting_for_same_title() -> None:
    combined = {
        'cast': [
            {
                'id': 42,
                'media_type': 'movie',
                'title': 'Obsession',
                'popularity': 200.0,
                'release_date': '2026-05-13',
                'character': 'Cameo (uncredited)',
            }
        ],
        'crew': [
            {
                'id': 42,
                'media_type': 'movie',
                'title': 'Obsession',
                'popularity': 200.0,
                'release_date': '2026-05-13',
                'department': 'Directing',
                'job': 'Director',
            }
        ],
    }
    known_for, filmography = curate_combined_credits(
        combined,
        known_for_department='Directing',
    )
    obs = [c for c in filmography if c.title == 'Obsession']
    assert {c.department for c in obs} == {'Acting', 'Directing'}
    director = next(c for c in obs if c.department == 'Directing')
    assert director.job == 'Director'
    assert known_for[0].department == 'Directing'
    assert known_for[0].job == 'Director'


def test_known_for_orders_by_popularity_not_rating() -> None:
    """Within a department, popularity beats a higher rating."""
    cast = [
        _cast_row(
            tmdb_id=1,
            title='Famous Flop',
            popularity=900.0,
            vote_average=4.0,
            vote_count=100,
        ),
        _cast_row(
            tmdb_id=2,
            title='Quiet Gem',
            popularity=5.0,
            vote_average=9.0,
            vote_count=100,
        ),
    ]
    known_for, filmography = curate_combined_credits(
        {'cast': cast, 'crew': []},
        known_for_department='Acting',
    )
    assert filmography[0].title == 'Famous Flop'
    assert [c.title for c in known_for] == ['Famous Flop', 'Quiet Gem']


def test_acting_known_for_puts_guest_appearances_after_roles() -> None:
    """Talk-show Self credits fill only after acted titles, by popularity."""
    cast = [
        {
            'id': 1,
            'media_type': 'tv',
            'name': 'The Tonight Show',
            'popularity': 900.0,
            'first_air_date': '2014-02-17',
            'character': 'Self - Guest',
            'genre_ids': [35, 10767],
            'episode_count': 2,
        },
        {
            'id': 2,
            'media_type': 'movie',
            'title': 'Euphoria Film',
            'popularity': 12.0,
            'release_date': '2022-01-01',
            'character': 'Rue',
            'genre_ids': [18],
        },
    ]
    known_for, _filmography = curate_combined_credits(
        {'cast': cast, 'crew': []},
        known_for_department='Acting',
    )
    assert [c.title for c in known_for] == [
        'Euphoria Film',
        'The Tonight Show',
    ]


def test_acting_known_for_does_not_drop_guests_when_roles_are_short() -> None:
    cast = [
        _cast_row(tmdb_id=1, title='Real Role', popularity=10.0),
        {
            'id': 2,
            'media_type': 'tv',
            'name': 'Talk Show',
            'popularity': 400.0,
            'character': 'Self - Guest',
            'genre_ids': [10767],
            'episode_count': 1,
        },
    ]
    known_for, _filmography = curate_combined_credits(
        {'cast': cast, 'crew': []},
        known_for_department='Acting',
    )
    assert [c.title for c in known_for] == ['Real Role', 'Talk Show']


def test_acting_known_for_skips_other_departments_until_acting_is_spent() -> None:
    cast = [
        _cast_row(tmdb_id=i + 1, title=f'Role {i}', popularity=float(i))
        for i in range(MAX_KNOWN_FOR)
    ]
    cast.append(
        {
            'id': 900,
            'media_type': 'tv',
            'name': 'Tonight Show',
            'popularity': 999.0,
            'character': 'Self - Guest',
            'genre_ids': [10767],
            'episode_count': 2,
        }
    )
    crew = [
        _crew_row(
            tmdb_id=901,
            title='Directed Hit',
            popularity=1000.0,
            department='Directing',
            job='Director',
        )
    ]
    known_for, _filmography = curate_combined_credits(
        {'cast': cast, 'crew': crew},
        known_for_department='Acting',
    )
    assert len(known_for) == MAX_KNOWN_FOR
    assert all(c.department == 'Acting' for c in known_for)
    assert all(c.title != 'Tonight Show' for c in known_for)
    assert all(c.title != 'Directed Hit' for c in known_for)


def test_host_with_long_run_is_a_principal_role() -> None:
    cards = [
        PersonTitleCard(
            type='tv',
            tmdb_id=1,
            title='Late Night',
            department='Acting',
            credit_kind='cast',
            character='Self - Host',
            popularity=80.0,
            episode_count=400,
            genre_ids=[10767],
        ),
        PersonTitleCard(
            type='movie',
            tmdb_id=2,
            title='Small Film',
            department='Acting',
            credit_kind='cast',
            character='Lead',
            popularity=5.0,
        ),
    ]
    picked = select_known_for(cards, known_for_department='Acting')
    assert [c.title for c in picked] == ['Late Night', 'Small Film']


def test_production_full_time_show_beats_guest_cameo() -> None:
    cards = [
        PersonTitleCard(
            type='tv',
            tmdb_id=1,
            title='The Kardashians',
            department='Acting',
            credit_kind='cast',
            character='Self',
            popularity=500.0,
            episode_count=1,
            genre_ids=[10764],
        ),
        PersonTitleCard(
            type='tv',
            tmdb_id=2,
            title='The Tonight Show',
            department='Production',
            credit_kind='crew',
            job='Executive Producer',
            popularity=40.0,
            episode_count=2413,
            genre_ids=[10767, 35],
        ),
        PersonTitleCard(
            type='movie',
            tmdb_id=3,
            title='Produced Film',
            department='Production',
            credit_kind='crew',
            job='Producer',
            popularity=10.0,
        ),
    ]
    picked = select_known_for(cards, known_for_department='Production')
    assert [c.title for c in picked] == [
        'The Tonight Show',
        'Produced Film',
        'The Kardashians',
    ]


def test_known_for_primary_fill_blocks_other_departments() -> None:
    cast = [
        _cast_row(
            tmdb_id=i + 1,
            title=f'Act {i}',
            popularity=float(i),
            vote_average=8.0,
            vote_count=50,
        )
        for i in range(MAX_KNOWN_FOR)
    ]
    crew = [
        _crew_row(
            tmdb_id=9000,
            title='Directed Hit',
            popularity=999.0,
            department='Directing',
            job='Director',
            vote_average=10.0,
            vote_count=500,
        )
    ]
    known_for, _filmography = curate_combined_credits(
        {'cast': cast, 'crew': crew},
        known_for_department='Acting',
    )
    assert len(known_for) == MAX_KNOWN_FOR
    assert all(c.department == 'Acting' for c in known_for)
    assert all(c.title != 'Directed Hit' for c in known_for)


def test_select_known_for_ignores_rating_and_uses_popularity() -> None:
    cards = [
        PersonTitleCard(
            type='movie',
            tmdb_id=1,
            title='Unrated Popular',
            department='Acting',
            popularity=80.0,
            rating=None,
        ),
        PersonTitleCard(
            type='movie',
            tmdb_id=2,
            title='Unrated Niche',
            department='Acting',
            popularity=10.0,
            rating=None,
        ),
        PersonTitleCard(
            type='movie',
            tmdb_id=3,
            title='Rated Mid',
            department='Acting',
            popularity=1.0,
            rating=TitleRating(value=3.0, source='tmdb', count=10),
        ),
    ]
    picked = select_known_for(cards, known_for_department='Acting')
    assert [c.title for c in picked] == [
        'Unrated Popular',
        'Unrated Niche',
        'Rated Mid',
    ]


def test_select_known_for_unique_titles_prefer_primary_dept() -> None:
    cards = [
        PersonTitleCard(
            type='movie',
            tmdb_id=42,
            title='Obsession',
            department='Acting',
            credit_kind='cast',
            character='Cameo',
            popularity=200.0,
            rating=TitleRating(value=4.0, source='tmdb', count=10),
        ),
        PersonTitleCard(
            type='movie',
            tmdb_id=42,
            title='Obsession',
            department='Directing',
            credit_kind='crew',
            job='Director',
            popularity=200.0,
            rating=TitleRating(value=4.0, source='tmdb', count=10),
        ),
        PersonTitleCard(
            type='movie',
            tmdb_id=7,
            title='Other',
            department='Writing',
            credit_kind='crew',
            job='Writer',
            popularity=50.0,
            rating=TitleRating(value=3.5, source='tmdb', count=10),
        ),
    ]
    picked = select_known_for(cards, known_for_department='Directing')
    assert len(picked) == 2
    keys = {(c.type, c.tmdb_id) for c in picked}
    assert keys == {('movie', 42), ('movie', 7)}
    obs = next(c for c in picked if c.tmdb_id == 42)
    assert obs.department == 'Directing'
    assert obs.job == 'Director'


def test_select_known_for_follows_department_precedence_after_primary() -> None:
    cards = [
        PersonTitleCard(
            type='movie',
            tmdb_id=1,
            title='Write One',
            department='Writing',
            popularity=10.0,
            rating=TitleRating(value=4.0, source='tmdb', count=5),
        ),
        PersonTitleCard(
            type='movie',
            tmdb_id=2,
            title='Produce One',
            department='Production',
            popularity=10.0,
            rating=TitleRating(value=4.0, source='tmdb', count=5),
        ),
        PersonTitleCard(
            type='movie',
            tmdb_id=3,
            title='Zebra Dept',
            department='Zebra',
            popularity=10.0,
            rating=TitleRating(value=4.0, source='tmdb', count=5),
        ),
        PersonTitleCard(
            type='movie',
            tmdb_id=4,
            title='Alpha Dept',
            department='Alpha',
            popularity=10.0,
            rating=TitleRating(value=4.0, source='tmdb', count=5),
        ),
        PersonTitleCard(
            type='movie',
            tmdb_id=5,
            title='Direct One',
            department='Directing',
            popularity=10.0,
            rating=TitleRating(value=3.0, source='tmdb', count=5),
        ),
    ]
    picked = select_known_for(cards, known_for_department='Directing')
    assert [c.title for c in picked] == [
        'Direct One',
        'Write One',
        'Produce One',
        'Alpha Dept',
        'Zebra Dept',
    ]


def test_also_known_as_capped() -> None:
    values = [f'Alias {i}' for i in range(50)]
    capped = also_known_as_capped(values)
    assert len(capped) == MAX_ALSO_KNOWN_AS


def test_enrich_doc_from_tmdb_payload_shape() -> None:
    doc = enrich_doc_from_tmdb_payload(
        {
            'biography': 'A bio.',
            'known_for_department': 'Acting',
            'also_known_as': ['L. Fishburne'],
            'homepage': 'https://example.com/',
            'external_ids': {'imdb_id': 'nm0000401'},
            'combined_credits': {
                'cast': [
                    {
                        'id': 603,
                        'media_type': 'movie',
                        'title': 'The Matrix',
                        'popularity': 80.0,
                        'release_date': '1999-03-31',
                        'character': 'Morpheus',
                        'vote_average': 8.2,
                        'vote_count': 500,
                        'runtime': 136,
                    }
                ],
                'crew': [],
            },
        }
    )
    assert doc['biography'] == 'A bio.'
    assert doc['known_for_department'] == 'Acting'
    assert doc['also_known_as'] == ['L. Fishburne']
    assert any(s['kind'] == 'imdb' for s in doc['socials'])
    assert doc['filmography'][0]['title'] == 'The Matrix'
    assert doc['filmography'][0]['type'] == 'movie'
    assert doc['filmography'][0]['tmdb_id'] == 603
    assert doc['filmography'][0]['popularity'] == 80.0
    assert doc['filmography'][0]['release_date'] == '1999-03-31'
    assert doc['filmography'][0]['runtime_minutes'] == 136
    assert doc['filmography'][0]['rating'] == {
        'value': 4.1,
        'source': 'tmdb',
        'count': 500,
    }
    assert len(doc['known_for']) == 1
    assert doc['known_for'][0]['title'] == 'The Matrix'
