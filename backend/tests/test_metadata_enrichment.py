"""Unit tests for TMDb extras curation."""

from __future__ import annotations

from app.metadata.enrichment import build_extras_from_tmdb_payload


def test_tv_extras_include_networks_and_episode_runtime() -> None:
    extras = build_extras_from_tmdb_payload(
        {
            'networks': [
                {'id': 174, 'name': 'AMC', 'origin_country': 'US'},
            ],
            'episode_run_time': [47, 58],
            'production_companies': [
                {'id': 1, 'name': 'High Bridge', 'origin_country': 'US'},
            ],
            'content_ratings': {
                'results': [
                    {'iso_3166_1': 'US', 'rating': 'TV-MA'},
                ],
            },
        },
        kind='tv',
    )

    assert extras['networks'] == [
        {'id': 174, 'name': 'AMC', 'origin_country': 'US'},
    ]
    assert extras['episode_runtime_minutes'] == 47
    assert extras['studios'][0]['name'] == 'High Bridge'
    assert extras['releases'][0]['certification'] == 'TV-MA'


def test_movie_extras_omit_networks() -> None:
    extras = build_extras_from_tmdb_payload(
        {
            'networks': [{'id': 1, 'name': 'Should ignore'}],
            'episode_run_time': [47],
            'production_companies': [{'id': 2, 'name': 'Studio'}],
        },
        kind='movie',
    )

    assert extras['networks'] == []
    assert extras['episode_runtime_minutes'] is None
    assert extras['studios'][0]['name'] == 'Studio'


def test_extras_cap_studios_networks_and_tv_releases() -> None:
    extras = build_extras_from_tmdb_payload(
        {
            'production_companies': [
                {'id': i, 'name': f'Studio {i}', 'origin_country': 'US'}
                for i in range(1, 25)
            ],
            'networks': [
                {'id': i, 'name': f'Network {i}', 'origin_country': 'US'}
                for i in range(1, 20)
            ],
            'content_ratings': {
                'results': [
                    {'iso_3166_1': f'C{i:02d}', 'rating': f'R{i}'}
                    for i in range(1, 40)
                ],
            },
        },
        kind='tv',
    )

    assert len(extras['studios']) == 16
    assert extras['studios'][0]['name'] == 'Studio 1'
    assert extras['studios'][-1]['name'] == 'Studio 16'
    assert len(extras['networks']) == 12
    assert extras['networks'][0]['name'] == 'Network 1'
    assert extras['networks'][-1]['name'] == 'Network 12'
    assert len(extras['releases']) == 24
    assert extras['releases'][0]['country'] == 'C01'
    assert extras['releases'][-1]['country'] == 'C24'
