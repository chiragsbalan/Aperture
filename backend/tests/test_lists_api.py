"""Integration tests for watchlist + favorites APIs."""

from __future__ import annotations

import asyncio
import uuid

import pytest
from app.core.db import dispose_db, init_db, session_scope
from app.main import app
from app.metadata import repository as metadata_repository
from app.metadata.ingest import seed_from_fixtures
from fastapi.testclient import TestClient


@pytest.fixture
def seeded_ids() -> dict[str, uuid.UUID]:
    """Seed fixtures and resolve well-known TMDb mappings."""

    async def _seed() -> dict[str, uuid.UUID]:
        async with session_scope() as session:
            await seed_from_fixtures(session)
            movie = await metadata_repository.get_external_id(
                session,
                source='tmdb',
                source_namespace='movie',
                external_id='278',
            )
            tv = await metadata_repository.get_external_id(
                session,
                source='tmdb',
                source_namespace='tv',
                external_id='1396',
            )
            person = await metadata_repository.get_external_id(
                session,
                source='tmdb',
                source_namespace='person',
                external_id='192',
            )
            assert movie is not None and movie.content_item_id is not None
            assert tv is not None and tv.content_item_id is not None
            assert person is not None and person.person_id is not None
            return {
                'movie': movie.content_item_id,
                'tv': tv.content_item_id,
                'person': person.person_id,
            }

    init_db()
    try:
        return asyncio.run(_seed())
    finally:
        asyncio.run(dispose_db())


@pytest.fixture
def api_client(seeded_ids: dict[str, uuid.UUID]) -> TestClient:
    del seeded_ids
    with TestClient(app) as client:
        yield client


def _register(api_client: TestClient) -> str:
    email = f'lists-{uuid.uuid4().hex[:12]}@example.com'
    username = f'l_{uuid.uuid4().hex[:10]}'
    res = api_client.post(
        '/api/v1/auth/register',
        json={
            'email': email,
            'username': username,
            'password': 'secure-pass-1',
        },
    )
    assert res.status_code == 201, res.text
    return res.json()['access_token']


@pytest.mark.integration
def test_watchlist_lazy_create_add_remove_idempotent(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    access = _register(api_client)
    headers = {'Authorization': f'Bearer {access}'}
    movie_id = str(seeded_ids['movie'])

    empty = api_client.get('/api/v1/me/watchlist', headers=headers)
    assert empty.status_code == 200, empty.text
    assert empty.json()['kind'] == 'watchlist'
    assert empty.json()['total'] == 0
    assert empty.json()['items'] == []

    added = api_client.post(
        '/api/v1/me/watchlist/items',
        headers=headers,
        json={'type': 'movie', 'id': movie_id},
    )
    assert added.status_code == 200, added.text
    body = added.json()
    assert body['content']['type'] == 'movie'
    assert body['content']['id'] == movie_id
    assert body['content']['title']
    item_id = body['item_id']

    again = api_client.post(
        '/api/v1/me/watchlist/items',
        headers=headers,
        json={'type': 'movie', 'id': movie_id},
    )
    assert again.status_code == 200, again.text
    assert again.json()['item_id'] == item_id

    listed = api_client.get('/api/v1/me/watchlist', headers=headers)
    assert listed.status_code == 200
    assert listed.json()['total'] == 1
    assert listed.json()['items'][0]['item_id'] == item_id

    removed = api_client.request(
        'DELETE',
        '/api/v1/me/watchlist/items',
        headers=headers,
        json={'type': 'movie', 'id': movie_id},
    )
    assert removed.status_code == 204, removed.text

    removed_again = api_client.request(
        'DELETE',
        '/api/v1/me/watchlist/items',
        headers=headers,
        json={'type': 'movie', 'id': movie_id},
    )
    assert removed_again.status_code == 204

    after = api_client.get('/api/v1/me/watchlist', headers=headers)
    assert after.json()['total'] == 0


@pytest.mark.integration
def test_favorites_and_independent_membership(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    access = _register(api_client)
    headers = {'Authorization': f'Bearer {access}'}
    movie_id = str(seeded_ids['movie'])
    tv_id = str(seeded_ids['tv'])

    assert (
        api_client.post(
            '/api/v1/me/watchlist/items',
            headers=headers,
            json={'type': 'movie', 'id': movie_id},
        ).status_code
        == 200
    )
    # Accept tv_show alias from detail DTOs.
    assert (
        api_client.post(
            '/api/v1/me/favorites/items',
            headers=headers,
            json={'type': 'tv_show', 'id': tv_id},
        ).status_code
        == 200
    )
    fav_movie = api_client.post(
        '/api/v1/me/favorites/items',
        headers=headers,
        json={'type': 'movie', 'id': movie_id},
    )
    assert fav_movie.status_code == 200
    assert fav_movie.json()['content']['type'] == 'movie'

    watchlist = api_client.get('/api/v1/me/watchlist', headers=headers).json()
    favorites = api_client.get('/api/v1/me/favorites', headers=headers).json()
    assert watchlist['total'] == 1
    assert favorites['total'] == 2
    assert favorites['items'][0]['content']['type'] in {'movie', 'tv'}

    contains = api_client.get(
        '/api/v1/me/favorites/contains',
        headers=headers,
        params=[
            ('ids', f'movie:{movie_id}'),
            ('ids', f'tv:{tv_id}'),
        ],
    )
    assert contains.status_code == 200, contains.text
    membership = contains.json()['membership']
    assert membership[f'movie:{movie_id}'] is True
    assert membership[f'tv:{tv_id}'] is True


@pytest.mark.integration
def test_person_rejected_and_unknown_content_404(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    access = _register(api_client)
    headers = {'Authorization': f'Bearer {access}'}

    person = api_client.post(
        '/api/v1/me/watchlist/items',
        headers=headers,
        json={'type': 'person', 'id': str(seeded_ids['person'])},
    )
    assert person.status_code == 422

    missing = api_client.post(
        '/api/v1/me/watchlist/items',
        headers=headers,
        json={'type': 'movie', 'id': str(uuid.uuid4())},
    )
    assert missing.status_code == 404


@pytest.mark.integration
def test_unauthenticated_watchlist_401(api_client: TestClient) -> None:
    res = api_client.get('/api/v1/me/watchlist')
    assert res.status_code == 401
