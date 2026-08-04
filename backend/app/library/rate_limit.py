"""Rate limits for diary / watch-entries reads via CacheBackend.

``GET /me/watch-entries/contains`` uses a dedicated Redis key namespace so it
does not share the lists write bucket. Window/max reuse the lists write
settings for operational simplicity.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import HTTPException, status

from app.core.cache import (
    CacheBackend,
    CacheBackendError,
    InMemoryCacheBackend,
    run_coro_sync,
)
from app.core.config import Settings
from app.core.security import hash_rate_limit_subject

logger = logging.getLogger(__name__)

_local_rl_fallback = InMemoryCacheBackend()


def _contains_rl_key(*, identity_id: uuid.UUID) -> str:
    return f'library:rl:contains:{hash_rate_limit_subject(str(identity_id))}'


def reset_library_contains_rate_limit_fallback() -> None:
    """Clear process-local contains RL fallback (tests)."""
    run_coro_sync(_local_rl_fallback.clear())


async def enforce_watch_entries_contains_rate_limit(
    cache: CacheBackend,
    *,
    settings: Settings,
    identity_id: uuid.UUID,
) -> None:
    """Raise 429 when an identity exceeds the contains window.

    Keys are ``library:rl:contains:{sha256(identity)}`` — independent of
    ``lists:rl:write:*``.
    """
    key = _contains_rl_key(identity_id=identity_id)
    window = settings.lists_rate_limit_window_seconds
    max_requests = settings.lists_rate_limit_max_writes
    try:
        count = await cache.incr(key, ttl_seconds=window)
    except CacheBackendError:
        logger.warning(
            'library contains rate limit falling back to process-local counter',
        )
        count = await _local_rl_fallback.incr(key, ttl_seconds=window)
    if count > max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='Too many library lookups. Try again later.',
        )
