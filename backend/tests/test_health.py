"""Smoke tests for operational endpoints."""

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_live_returns_200() -> None:
    response = client.get('/health/live')
    assert response.status_code == 200
    assert response.json()['status'] == 'alive'


def test_ready_returns_200() -> None:
    response = client.get('/health/ready')
    assert response.status_code == 200
    assert response.json()['status'] == 'ready'


def test_version_returns_metadata() -> None:
    response = client.get('/version')
    assert response.status_code == 200
    body = response.json()
    assert body['name'] == 'Aperture'
    assert 'version' in body
