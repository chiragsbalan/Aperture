"""Smoke tests for operational endpoints."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


def test_live_returns_200(client: TestClient) -> None:
    response = client.get('/health/live')
    assert response.status_code == 200
    assert response.json()['status'] == 'alive'


def test_ready_returns_200_when_db_ok(client: TestClient) -> None:
    with patch('app.api.health.ping_database', new_callable=AsyncMock) as ping:
        ping.return_value = None
        response = client.get('/health/ready')
    assert response.status_code == 200
    assert response.json()['status'] == 'ready'
    ping.assert_awaited_once()


def test_ready_returns_503_when_db_down(client: TestClient) -> None:
    with patch('app.api.health.ping_database', new_callable=AsyncMock) as ping:
        ping.side_effect = OSError('db down')
        response = client.get('/health/ready')
    assert response.status_code == 503
    assert response.json()['detail']['status'] == 'not_ready'


def test_version_returns_metadata(client: TestClient) -> None:
    response = client.get('/version')
    assert response.status_code == 200
    body = response.json()
    assert body['name'] == 'Aperture'
    assert 'version' in body


@pytest.mark.integration
def test_ready_against_postgres(client: TestClient) -> None:
    """Hit readiness with a real DATABASE_URL (Compose/CI Postgres)."""
    response = client.get('/health/ready')
    assert response.status_code == 200
    assert response.json()['status'] == 'ready'
