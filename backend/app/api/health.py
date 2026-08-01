"""Operational health and version endpoints (outside /api/v1)."""

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError

from app.core.db import ping_database
from app.core.deps import SettingsDep

logger = logging.getLogger(__name__)

router = APIRouter(tags=['ops'])


@router.get('/health/live')
def live() -> dict[str, str]:
    """Liveness: process is up."""
    return {'status': 'alive'}


@router.get('/health/ready')
async def ready() -> dict[str, str]:
    """Readiness: Postgres is reachable."""
    try:
        await ping_database()
    except (SQLAlchemyError, OSError, TimeoutError) as exc:
        # Log type only — driver errors can embed DSN credentials.
        logger.warning('Readiness check failed (%s)', type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={'status': 'not_ready'},
        ) from None
    return {'status': 'ready'}


@router.get('/version')
def version(settings: SettingsDep) -> dict[str, str]:
    """Return application version metadata."""
    return {
        'name': settings.app_name,
        'version': settings.app_version,
        'environment': settings.environment,
    }
