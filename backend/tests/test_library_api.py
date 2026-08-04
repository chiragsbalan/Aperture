"""Integration tests for custom lists (P3.3) and diary (P3.4)."""

from __future__ import annotations

import asyncio
import concurrent.futures
import os
import uuid
from datetime import date

import asyncpg
import pytest
from app.core.db import dispose_db, init_db, session_scope
from app.lists.service import MAX_CUSTOM_LISTS
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


def _register(api_client: TestClient, *, prefix: str = 'lib') -> str:
    email = f'{prefix}-{uuid.uuid4().hex[:12]}@example.com'
    username = f'{prefix[0]}_{uuid.uuid4().hex[:10]}'
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


def _register_with_username(
    api_client: TestClient,
    *,
    prefix: str = 'lib',
) -> tuple[str, str]:
    email = f'{prefix}-{uuid.uuid4().hex[:12]}@example.com'
    username = f'{prefix[0]}_{uuid.uuid4().hex[:10]}'
    res = api_client.post(
        '/api/v1/auth/register',
        json={
            'email': email,
            'username': username,
            'password': 'secure-pass-1',
        },
    )
    assert res.status_code == 201, res.text
    return res.json()['access_token'], username


def _latest_system_list_id(*, kind: str) -> uuid.UUID:
    """Look up a system list id without touching the TestClient event loop."""
    async_url = os.environ.get(
        'DATABASE_URL',
        'postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
    )
    dsn = async_url.replace('postgresql+asyncpg://', 'postgresql://', 1)

    async def _fetch() -> uuid.UUID:
        conn = await asyncpg.connect(dsn)
        try:
            row = await conn.fetchrow(
                'SELECT id FROM lists WHERE kind = $1 ORDER BY created_at DESC LIMIT 1',
                kind,
            )
        finally:
            await conn.close()
        assert row is not None
        return row['id']

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(lambda: asyncio.run(_fetch())).result()


@pytest.mark.integration
def test_custom_list_crud_newest_first_and_compact(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    access = _register(api_client, prefix='lists')
    headers = {'Authorization': f'Bearer {access}'}
    movie_id = str(seeded_ids['movie'])
    tv_id = str(seeded_ids['tv'])

    created = api_client.post(
        '/api/v1/me/lists',
        headers=headers,
        json={
            'title': 'Comfort films',
            'description': 'Rainy days',
            'visibility': 'private',
        },
    )
    assert created.status_code == 201, created.text
    list_id = created.json()['id']
    assert created.json()['kind'] == 'custom'
    assert created.json()['item_count'] == 0

    mine = api_client.get('/api/v1/me/lists', headers=headers)
    assert mine.status_code == 200
    assert len(mine.json()['lists']) == 1

    added_movie = api_client.post(
        f'/api/v1/lists/{list_id}/items',
        headers=headers,
        json={'type': 'movie', 'id': movie_id},
    )
    assert added_movie.status_code == 200, added_movie.text
    movie_item_id = added_movie.json()['item_id']

    added_tv = api_client.post(
        f'/api/v1/lists/{list_id}/items',
        headers=headers,
        json={'type': 'tv', 'id': tv_id},
    )
    assert added_tv.status_code == 200, added_tv.text
    tv_item_id = added_tv.json()['item_id']

    again = api_client.post(
        f'/api/v1/lists/{list_id}/items',
        headers=headers,
        json={'type': 'movie', 'id': movie_id},
    )
    assert again.status_code == 200
    assert again.json()['item_id'] == movie_item_id

    items = api_client.get(
        f'/api/v1/lists/{list_id}/items',
        headers=headers,
    )
    assert items.status_code == 200
    body = items.json()
    assert body['total'] == 2
    # Newest added first (tv after movie).
    assert [row['item_id'] for row in body['items']] == [
        tv_item_id,
        movie_item_id,
    ]

    deleted = api_client.delete(
        f'/api/v1/lists/{list_id}/items/{tv_item_id}',
        headers=headers,
    )
    assert deleted.status_code == 204

    after_delete = api_client.get(
        f'/api/v1/lists/{list_id}/items',
        headers=headers,
    )
    assert after_delete.json()['total'] == 1
    assert after_delete.json()['items'][0]['item_id'] == movie_item_id
    assert after_delete.json()['items'][0]['position'] == 0

    patched = api_client.patch(
        f'/api/v1/lists/{list_id}',
        headers=headers,
        json={'title': 'Updated', 'visibility': 'public'},
    )
    assert patched.status_code == 200
    assert patched.json()['title'] == 'Updated'
    assert patched.json()['visibility'] == 'public'

    assert created.json()['is_owner'] is True
    assert created.json()['owner_user_id'] is not None

    anon = api_client.get(f'/api/v1/lists/{list_id}')
    assert anon.status_code == 200
    assert anon.json()['title'] == 'Updated'
    assert anon.json()['is_owner'] is False
    assert anon.json()['owner_user_id'] is None

    anon_items = api_client.get(f'/api/v1/lists/{list_id}/items')
    assert anon_items.status_code == 200
    assert anon_items.json()['total'] == 1


@pytest.mark.integration
def test_private_list_404_system_mutate_404_bad_token_401(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    owner = _register(api_client, prefix='own')
    other = _register(api_client, prefix='oth')
    owner_headers = {'Authorization': f'Bearer {owner}'}
    other_headers = {'Authorization': f'Bearer {other}'}
    movie_id = str(seeded_ids['movie'])

    created = api_client.post(
        '/api/v1/me/lists',
        headers=owner_headers,
        json={'title': 'Secret', 'visibility': 'private'},
    )
    assert created.status_code == 201
    list_id = created.json()['id']
    assert created.json()['is_owner'] is True
    assert created.json()['owner_user_id'] is not None

    assert (
        api_client.get(f'/api/v1/lists/{list_id}', headers=other_headers).status_code
        == 404
    )
    assert api_client.get(f'/api/v1/lists/{list_id}').status_code == 404
    assert (
        api_client.get(
            f'/api/v1/lists/{list_id}/items',
            headers=other_headers,
        ).status_code
        == 404
    )
    assert (
        api_client.patch(
            f'/api/v1/lists/{list_id}',
            headers=other_headers,
            json={'title': 'Nope'},
        ).status_code
        == 404
    )

    bad = api_client.get(
        f'/api/v1/lists/{list_id}',
        headers={'Authorization': 'Bearer not-a-real-token'},
    )
    assert bad.status_code == 401

    watch = api_client.get('/api/v1/me/watchlist', headers=owner_headers)
    assert watch.status_code == 200
    system_id = _latest_system_list_id(kind='watchlist')

    assert (
        api_client.delete(
            f'/api/v1/lists/{system_id}',
            headers=owner_headers,
        ).status_code
        == 404
    )
    assert (
        api_client.post(
            f'/api/v1/lists/{system_id}/items',
            headers=owner_headers,
            json={'type': 'movie', 'id': movie_id},
        ).status_code
        == 404
    )
    assert (
        api_client.get(
            f'/api/v1/lists/{system_id}/contains',
            headers=owner_headers,
            params=[('ids', f'movie:{movie_id}')],
        ).status_code
        == 404
    )
    assert api_client.get(f'/api/v1/lists/{system_id}').status_code == 404


@pytest.mark.integration
def test_public_private_list_read_authz(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    owner = _register(api_client, prefix='vis')
    owner_headers = {'Authorization': f'Bearer {owner}'}
    movie_id = str(seeded_ids['movie'])

    rejected = api_client.post(
        '/api/v1/me/lists',
        headers=owner_headers,
        json={'title': 'Link picks', 'visibility': 'unlisted'},
    )
    assert rejected.status_code == 422

    private = api_client.post(
        '/api/v1/me/lists',
        headers=owner_headers,
        json={'title': 'Private picks', 'visibility': 'private'},
    )
    assert private.status_code == 201
    private_id = private.json()['id']
    assert api_client.get(f'/api/v1/lists/{private_id}').status_code == 404

    public = api_client.post(
        '/api/v1/me/lists',
        headers=owner_headers,
        json={'title': 'Public picks', 'visibility': 'public'},
    )
    assert public.status_code == 201
    public_id = public.json()['id']
    assert (
        api_client.post(
            f'/api/v1/lists/{public_id}/items',
            headers=owner_headers,
            json={'type': 'movie', 'id': movie_id},
        ).status_code
        == 200
    )

    anon_public_items = api_client.get(f'/api/v1/lists/{public_id}/items')
    assert anon_public_items.status_code == 200
    assert anon_public_items.json()['total'] == 1
    anon_public = api_client.get(f'/api/v1/lists/{public_id}')
    assert anon_public.status_code == 200
    assert anon_public.json()['is_owner'] is False
    assert anon_public.json()['owner_user_id'] is None


@pytest.mark.integration
def test_system_list_visibility_is_fixed(
    api_client: TestClient,
) -> None:
    owner = _register(api_client, prefix='sysvis')
    owner_headers = {'Authorization': f'Bearer {owner}'}

    watchlist = api_client.get('/api/v1/me/watchlist', headers=owner_headers)
    assert watchlist.status_code == 200
    assert watchlist.json()['visibility'] == 'public'

    favorites = api_client.get('/api/v1/me/favorites', headers=owner_headers)
    assert favorites.status_code == 200
    assert favorites.json()['visibility'] == 'private'

    assert (
        api_client.patch(
            '/api/v1/me/watchlist',
            headers=owner_headers,
            json={'visibility': 'private'},
        ).status_code
        == 405
    )
    assert (
        api_client.patch(
            '/api/v1/me/favorites',
            headers=owner_headers,
            json={'visibility': 'public'},
        ).status_code
        == 405
    )


@pytest.mark.integration
def test_public_profile_lists_and_watchlist_authz(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    owner_token, username = _register_with_username(api_client, prefix='pc2')
    owner_headers = {'Authorization': f'Bearer {owner_token}'}
    other_token, _ = _register_with_username(api_client, prefix='pc2o')
    other_headers = {'Authorization': f'Bearer {other_token}'}
    movie_id = str(seeded_ids['movie'])

    # Empty watchlist is public without owner ever touching /me/watchlist
    # and must not lazy-create a lists row.
    empty_wl = api_client.get(f'/api/v1/users/{username}/watchlist')
    assert empty_wl.status_code == 200
    assert empty_wl.json()['total'] == 0
    assert empty_wl.json()['visibility'] == 'public'

    index = api_client.get(f'/api/v1/users/{username}/lists')
    assert index.status_code == 200
    assert index.json()['lists'] == []

    public = api_client.post(
        '/api/v1/me/lists',
        headers=owner_headers,
        json={'title': 'Public shelf', 'visibility': 'public'},
    )
    assert public.status_code == 201
    public_id = public.json()['id']
    private = api_client.post(
        '/api/v1/me/lists',
        headers=owner_headers,
        json={'title': 'Secret shelf', 'visibility': 'private'},
    )
    assert private.status_code == 201
    private_id = private.json()['id']

    anon_index = api_client.get(f'/api/v1/users/{username}/lists')
    assert anon_index.status_code == 200
    anon_ids = {row['id'] for row in anon_index.json()['lists']}
    assert public_id in anon_ids
    assert private_id not in anon_ids
    assert all(row['kind'] == 'custom' for row in anon_index.json()['lists'])

    # Other signed-in users get the same public index (no private oracle).
    other_index = api_client.get(
        f'/api/v1/users/{username}/lists',
        headers=other_headers,
    )
    assert other_index.status_code == 200
    other_ids = {row['id'] for row in other_index.json()['lists']}
    assert other_ids == anon_ids

    # Owner sees every custom list on the index (no filter UI).
    owner_index = api_client.get(
        f'/api/v1/users/{username}/lists',
        headers=owner_headers,
    )
    assert owner_index.status_code == 200
    owner_ids = {row['id'] for row in owner_index.json()['lists']}
    assert public_id in owner_ids
    assert private_id in owner_ids

    assert (
        api_client.post(
            '/api/v1/me/watchlist/items',
            headers=owner_headers,
            json={'type': 'movie', 'id': movie_id},
        ).status_code
        == 200
    )
    filled = api_client.get(f'/api/v1/users/{username}/watchlist')
    assert filled.status_code == 200
    assert filled.json()['total'] == 1


@pytest.mark.integration
def test_diary_rewatch_and_remove_from_watchlist_txn(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    access = _register(api_client, prefix='diary')
    headers = {'Authorization': f'Bearer {access}'}
    movie_id = str(seeded_ids['movie'])

    assert (
        api_client.post(
            '/api/v1/me/watchlist/items',
            headers=headers,
            json={'type': 'movie', 'id': movie_id},
        ).status_code
        == 200
    )

    first = api_client.post(
        '/api/v1/me/watch-entries',
        headers=headers,
        json={
            'type': 'movie',
            'id': movie_id,
            'watched_at': '2026-01-01',
            'note': 'First pass',
            'rating': 4.5,
        },
    )
    assert first.status_code == 201, first.text
    first_body = first.json()
    first_id = first_body['id']
    assert first_body['rating'] == 4.5

    # Logging a watch always clears watchlist membership.
    contains_after_first = api_client.get(
        '/api/v1/me/watchlist/contains',
        headers=headers,
        params=[('ids', f'movie:{movie_id}')],
    )
    assert contains_after_first.status_code == 200
    assert contains_after_first.json()['membership'][f'movie:{movie_id}'] is False

    logged = api_client.get(
        '/api/v1/me/watch-entries/contains',
        headers=headers,
        params=[('ids', f'movie:{movie_id}')],
    )
    assert logged.status_code == 200, logged.text
    assert logged.json()['membership'][f'movie:{movie_id}'] is True

    bad_rating = api_client.post(
        '/api/v1/me/watch-entries',
        headers=headers,
        json={
            'type': 'movie',
            'id': movie_id,
            'watched_at': '2026-01-03',
            'rating': 4.25,
        },
    )
    assert bad_rating.status_code == 422, bad_rating.text

    second = api_client.post(
        '/api/v1/me/watch-entries',
        headers=headers,
        json={
            'type': 'movie',
            'id': movie_id,
            'watched_at': str(date.today()),
            'note': 'Rewatch',
        },
    )
    assert second.status_code == 201, second.text
    assert second.json()['id'] != first_id
    assert second.json()['rating'] is None

    feed = api_client.get('/api/v1/me/watch-entries', headers=headers)
    assert feed.status_code == 200
    assert feed.json()['total'] == 2

    patched = api_client.patch(
        f'/api/v1/me/watch-entries/{first_id}',
        headers=headers,
        json={
            'note': 'Updated note',
            'watched_at': '2026-01-02',
            'rating': 3.0,
        },
    )
    assert patched.status_code == 200
    assert patched.json()['note'] == 'Updated note'
    assert patched.json()['watched_at'] == '2026-01-02'
    assert patched.json()['rating'] == 3.0

    cleared = api_client.patch(
        f'/api/v1/me/watch-entries/{first_id}',
        headers=headers,
        json={'rating': None},
    )
    assert cleared.status_code == 200
    assert cleared.json()['rating'] is None

    other = _register(api_client, prefix='d2')
    other_headers = {'Authorization': f'Bearer {other}'}
    assert (
        api_client.patch(
            f'/api/v1/me/watch-entries/{first_id}',
            headers=other_headers,
            json={'note': 'stolen'},
        ).status_code
        == 404
    )
    assert (
        api_client.delete(
            f'/api/v1/me/watch-entries/{first_id}',
            headers=other_headers,
        ).status_code
        == 404
    )

    deleted = api_client.delete(
        f'/api/v1/me/watch-entries/{first_id}',
        headers=headers,
    )
    assert deleted.status_code == 204
    after = api_client.get('/api/v1/me/watch-entries', headers=headers)
    assert after.json()['total'] == 1


@pytest.mark.integration
def test_custom_list_cap_and_membership_helper(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    access = _register(api_client, prefix='cap')
    headers = {'Authorization': f'Bearer {access}'}
    movie_id = str(seeded_ids['movie'])

    for index in range(MAX_CUSTOM_LISTS):
        res = api_client.post(
            '/api/v1/me/lists',
            headers=headers,
            json={'title': f'List {index}'},
        )
        assert res.status_code == 201, res.text

    overflow = api_client.post(
        '/api/v1/me/lists',
        headers=headers,
        json={'title': 'One too many'},
    )
    assert overflow.status_code == 409

    lists = api_client.get('/api/v1/me/lists', headers=headers).json()['lists']
    list_id = lists[0]['id']
    assert (
        api_client.post(
            f'/api/v1/lists/{list_id}/items',
            headers=headers,
            json={'type': 'movie', 'id': movie_id},
        ).status_code
        == 200
    )

    membership = api_client.get(
        '/api/v1/me/lists/membership',
        headers=headers,
        params={'type': 'movie', 'id': movie_id},
    )
    assert membership.status_code == 200, membership.text
    body = membership.json()
    assert body['membership'][list_id] is True
    assert list_id in body['item_ids']

    person = api_client.post(
        f'/api/v1/lists/{list_id}/items',
        headers=headers,
        json={'type': 'person', 'id': str(seeded_ids['person'])},
    )
    assert person.status_code == 422


@pytest.mark.integration
def test_public_diary_is_readable_without_auth(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    access = _register(api_client, prefix='pdry')
    headers = {'Authorization': f'Bearer {access}'}
    movie_id = str(seeded_ids['movie'])
    me = api_client.get('/api/v1/users/me', headers=headers)
    assert me.status_code == 200
    username = me.json()['username']

    created = api_client.post(
        '/api/v1/me/watch-entries',
        headers=headers,
        json={
            'type': 'movie',
            'id': movie_id,
            'watched_at': '2026-03-15',
            'note': 'Public wall note',
        },
    )
    assert created.status_code == 201, created.text

    public = api_client.get(f'/api/v1/users/{username}/watch-entries')
    assert public.status_code == 200, public.text
    body = public.json()
    assert body['total'] == 1
    assert body['items'][0]['watched_at'] == '2026-03-15'
    assert body['items'][0]['note'] == 'Public wall note'
    assert body['items'][0]['content']['id'] == movie_id

    missing = api_client.get('/api/v1/users/no_such_user_zzz/watch-entries')
    assert missing.status_code == 404


@pytest.mark.integration
def test_watch_entries_contains_unsupported_type_is_false(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    access = _register(api_client, prefix='wecf')
    headers = {'Authorization': f'Bearer {access}'}
    movie_id = str(seeded_ids['movie'])
    person_id = str(seeded_ids['person'])

    res = api_client.get(
        '/api/v1/me/watch-entries/contains',
        headers=headers,
        params=[
            ('ids', f'movie:{movie_id}'),
            ('ids', f'person:{person_id}'),
        ],
    )
    assert res.status_code == 200, res.text
    membership = res.json()['membership']
    assert membership[f'movie:{movie_id}'] is False
    assert membership[f'person:{person_id}'] is False

    malformed = api_client.get(
        '/api/v1/me/watch-entries/contains',
        headers=headers,
        params=[('ids', 'not-a-pair')],
    )
    assert malformed.status_code == 422


@pytest.mark.integration
def test_watch_entries_contains_rate_limit_independent_of_writes(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv('LISTS_RATE_LIMIT_MAX_WRITES', '2')
    from app.core.config import get_settings

    get_settings.cache_clear()

    access = _register(api_client, prefix='wecrl')
    headers = {'Authorization': f'Bearer {access}'}
    movie_id = str(seeded_ids['movie'])
    params = [('ids', f'movie:{movie_id}')]

    for _ in range(2):
        ok = api_client.get(
            '/api/v1/me/watch-entries/contains',
            headers=headers,
            params=params,
        )
        assert ok.status_code == 200, ok.text

    limited = api_client.get(
        '/api/v1/me/watch-entries/contains',
        headers=headers,
        params=params,
    )
    assert limited.status_code == 429
    assert limited.json()['detail'] == ('Too many library lookups. Try again later.')

    # Exhausting the contains bucket must not consume the lists write bucket.
    write = api_client.post(
        '/api/v1/me/watchlist/items',
        headers=headers,
        json={'type': 'movie', 'id': movie_id},
    )
    assert write.status_code == 200, write.text


@pytest.mark.integration
def test_public_list_get_rate_limit_trusted_ip_returns_429(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('USERS_PUBLIC_RATE_LIMIT_MAX_PER_IP', '2')
    from app.core.config import get_settings

    get_settings.cache_clear()

    access = _register(api_client, prefix='plrl')
    headers_auth = {'Authorization': f'Bearer {access}'}
    movie_id = str(seeded_ids['movie'])

    created = api_client.post(
        '/api/v1/me/lists',
        headers=headers_auth,
        json={'title': 'Public rail', 'visibility': 'public'},
    )
    assert created.status_code == 201, created.text
    list_id = created.json()['id']
    assert (
        api_client.post(
            f'/api/v1/lists/{list_id}/items',
            headers=headers_auth,
            json={'type': 'movie', 'id': movie_id},
        ).status_code
        == 200
    )

    ip = f'203.0.113.{uuid.uuid4().int % 200 + 1}'
    rl_headers = {
        'X-Aperture-Client-IP': ip,
        'X-Aperture-BFF-Secret': secret,
    }

    assert (
        api_client.get(f'/api/v1/lists/{list_id}', headers=rl_headers).status_code
        == 200
    )
    assert (
        api_client.get(
            f'/api/v1/lists/{list_id}/items',
            headers=rl_headers,
        ).status_code
        == 200
    )

    limited = api_client.get(f'/api/v1/lists/{list_id}', headers=rl_headers)
    assert limited.status_code == 429
    assert limited.json()['detail'] == ('Too many profile requests. Try again later.')
