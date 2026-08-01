"""Integration tests for GET /api/v1/search."""

from __future__ import annotations

import asyncio
import uuid

import pytest
from app.core.db import dispose_db, init_db, session_scope
from app.main import app
from app.metadata.ingest import seed_from_fixtures
from fastapi.testclient import TestClient


@pytest.fixture
def seeded_catalog() -> None:
    """Seed fixtures on a fresh engine, then dispose for TestClient."""

    async def _seed() -> None:
        async with session_scope() as session:
            await seed_from_fixtures(session)

    init_db()
    try:
        asyncio.run(_seed())
    finally:
        asyncio.run(dispose_db())


@pytest.fixture
def api_client(seeded_catalog: None) -> TestClient:
    """HTTP client after catalog seed."""
    del seeded_catalog
    with TestClient(app) as client:
        yield client


def _trusted_ip_headers(ip: str, *, secret: str) -> dict[str, str]:
    return {
        'X-Aperture-Client-IP': ip,
        'X-Aperture-BFF-Secret': secret,
    }


@pytest.mark.integration
def test_search_finds_movie_and_person(api_client: TestClient) -> None:
    movie = api_client.get('/api/v1/search', params={'q': 'Shawshank'})
    assert movie.status_code == 200, movie.text
    body = movie.json()
    assert body['total'] >= 1
    assert any(
        hit['type'] == 'movie' and 'Shawshank' in hit['title']
        for hit in body['results']
    )

    person = api_client.get('/api/v1/search', params={'q': 'Morgan'})
    assert person.status_code == 200, person.text
    pbody = person.json()
    assert any(
        hit['type'] == 'person' and 'Morgan' in hit['title']
        for hit in pbody['results']
    )


@pytest.mark.integration
def test_search_type_filter(api_client: TestClient) -> None:
    res = api_client.get(
        '/api/v1/search',
        params={'q': 'Bad', 'types': 'tv'},
    )
    assert res.status_code == 200, res.text
    assert all(hit['type'] == 'tv' for hit in res.json()['results'])


@pytest.mark.integration
def test_search_rejects_empty_and_oversized(api_client: TestClient) -> None:
    empty = api_client.get('/api/v1/search', params={'q': '  '})
    assert empty.status_code == 400

    huge = api_client.get('/api/v1/search', params={'q': 'x' * 101})
    assert huge.status_code == 400


@pytest.mark.integration
def test_search_rate_limit_trusted_ip_returns_429(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('SEARCH_RATE_LIMIT_MAX_PER_IP', '2')
    from app.core.config import get_settings

    get_settings.cache_clear()

    ip = f'203.0.113.{uuid.uuid4().int % 200 + 1}'
    headers = _trusted_ip_headers(ip, secret=secret)
    for _ in range(2):
        ok = api_client.get(
            '/api/v1/search',
            params={'q': 'Shawshank'},
            headers=headers,
        )
        assert ok.status_code == 200, ok.text
    limited = api_client.get(
        '/api/v1/search',
        params={'q': 'Shawshank'},
        headers=headers,
    )
    assert limited.status_code == 429
    assert limited.json()['detail'] == 'Too many search requests. Try again later.'


@pytest.mark.integration
def test_search_wrong_bff_secret_ignores_spoofed_ip(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = 'test-bff-shared-secret'
    monkeypatch.setenv('AUTH_BFF_SHARED_SECRET', secret)
    monkeypatch.setenv('SEARCH_RATE_LIMIT_MAX_PER_IP', '2')
    from app.core.config import get_settings

    get_settings.cache_clear()

    spoofed = f'198.51.100.{uuid.uuid4().int % 200 + 1}'
    wrong_headers = {
        'X-Aperture-Client-IP': spoofed,
        'X-Aperture-BFF-Secret': 'wrong-secret-value!',
    }
    # Socket peer (testclient) shares one bucket; wrong secret must not
    # create a separate spoofed-IP bucket that escapes the limit.
    for _ in range(2):
        ok = api_client.get(
            '/api/v1/search',
            params={'q': 'Shawshank'},
            headers=wrong_headers,
        )
        assert ok.status_code == 200, ok.text
    limited = api_client.get(
        '/api/v1/search',
        params={'q': 'Shawshank'},
        headers=wrong_headers,
    )
    assert limited.status_code == 429

    # A correctly authenticated distinct IP still has its own budget.
    trusted = _trusted_ip_headers(
        f'203.0.113.{uuid.uuid4().int % 200 + 1}',
        secret=secret,
    )
    still_ok = api_client.get(
        '/api/v1/search',
        params={'q': 'Shawshank'},
        headers=trusted,
    )
    assert still_ok.status_code == 200, still_ok.text
