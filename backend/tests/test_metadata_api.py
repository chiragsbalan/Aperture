"""Integration tests for public metadata detail APIs."""

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
    """Seed fixtures and resolve well-known TMDb mappings on a fresh engine."""

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
    """HTTP client after seed (engine disposed so TestClient owns a fresh loop)."""
    del seeded_ids  # dependency ordering only; IDs come from the seeded_ids fixture
    with TestClient(app) as client:
        yield client


@pytest.mark.integration
def test_movie_detail_200(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    res = api_client.get(f'/api/v1/movies/{seeded_ids["movie"]}')
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['type'] == 'movie'
    assert body['title'] == 'The Shawshank Redemption'
    assert body['poster_url'] is not None
    assert body['poster_url'].startswith('https://image.tmdb.org/t/p/')
    assert any(c['name'] == 'Morgan Freeman' for c in body['cast'])
    assert res.headers.get('cache-control') == 'public, max-age=300'


@pytest.mark.integration
def test_tv_detail_200(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    res = api_client.get(f'/api/v1/tv/{seeded_ids["tv"]}')
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['type'] == 'tv_show'
    assert body['title'] == 'Breaking Bad'
    assert len(body['seasons']) >= 1
    assert body['seasons'][0]['episodes']


@pytest.mark.integration
def test_person_detail_200(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    res = api_client.get(f'/api/v1/people/{seeded_ids["person"]}')
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['type'] == 'person'
    assert body['name'] == 'Morgan Freeman'
    assert body['biography']
    assert any(c['title'] == 'The Shawshank Redemption' for c in body['credits'])


@pytest.mark.integration
def test_detail_404_missing_and_wrong_type(
    api_client: TestClient,
    seeded_ids: dict[str, uuid.UUID],
) -> None:
    missing = uuid.uuid4()
    assert api_client.get(f'/api/v1/movies/{missing}').status_code == 404
    assert api_client.get(f'/api/v1/tv/{missing}').status_code == 404
    assert api_client.get(f'/api/v1/people/{missing}').status_code == 404
    # Movie id under /tv → 404 (wrong type).
    assert api_client.get(f'/api/v1/tv/{seeded_ids["movie"]}').status_code == 404
    assert api_client.get(f'/api/v1/movies/{seeded_ids["tv"]}').status_code == 404
