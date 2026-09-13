"""Background rebuild loop for the username bloom filter (ADR-0018)."""

from __future__ import annotations

import asyncio
import logging

from app.core.config import Settings
from app.core.db import get_session_factory
from app.users.bloom import get_username_bloom
from app.users.username_availability import rebuild_username_bloom

logger = logging.getLogger(__name__)


async def ensure_username_bloom_ready(settings: Settings) -> None:
    """Rebuild on boot when bloom is enabled and missing/unready."""
    if not settings.username_bloom_enabled:
        return
    bloom = get_username_bloom()
    if bloom is None:
        return
    try:
        if await bloom.is_ready():
            logger.info('username bloom already ready')
            return
    except Exception:
        logger.warning('username bloom readiness check failed', exc_info=True)

    factory = get_session_factory()
    async with factory() as session:
        try:
            await rebuild_username_bloom(session)
        except Exception:
            logger.warning('username bloom boot rebuild failed', exc_info=True)


async def username_bloom_rebuild_loop(
    settings: Settings,
    *,
    stop: asyncio.Event,
) -> None:
    """Periodic bloom rebuild so drift does not accumulate."""
    if not settings.username_bloom_enabled:
        return
    interval = max(60, settings.username_bloom_rebuild_interval_seconds)
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
            break
        except TimeoutError:
            pass
        if stop.is_set():
            break
        bloom = get_username_bloom()
        if bloom is None:
            continue
        factory = get_session_factory()
        async with factory() as session:
            try:
                await rebuild_username_bloom(session)
            except Exception:
                logger.warning(
                    'username bloom periodic rebuild failed',
                    exc_info=True,
                )
