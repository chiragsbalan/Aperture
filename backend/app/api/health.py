"""Operational health and version endpoints (outside /api/v1)."""

from fastapi import APIRouter

from app.core.deps import SettingsDep

router = APIRouter(tags=['ops'])


@router.get('/health/live')
def live() -> dict[str, str]:
    """Liveness: process is up."""
    return {'status': 'alive'}


@router.get('/health/ready')
def ready() -> dict[str, str]:
    """Readiness stub without DB (DB check lands in P0.2)."""
    return {'status': 'ready'}


@router.get('/version')
def version(settings: SettingsDep) -> dict[str, str]:
    """Return application version metadata."""
    return {
        'name': settings.app_name,
        'version': settings.app_version,
        'environment': settings.environment,
    }
