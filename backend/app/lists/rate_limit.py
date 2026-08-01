"""Write rate limits for personal library mutations via CacheBackend."""

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


def _lists_rl_key(*, identity_id: uuid.UUID) -> str:
    return f'lists:rl:write:{hash_rate_limit_subject(str(identity_id))}'


def reset_lists_rate_limit_fallback() -> None:
    """Clear process-local lists RL fallback (tests)."""
    run_coro_sync(_local_rl_fallback.clear())


async def enforce_lists_write_rate_limit(
    cache: CacheBackend,
    *,
    settings: Settings,
    identity_id: uuid.UUID,
    client_ip: str | None,
) -> None:
    """Raise 429 when an identity exceeds the list-write window.

    ``client_ip`` is accepted for future IP-based caps; writes are keyed by
    identity so rotating IPs cannot reset the bucket.
    """
    del client_ip  # reserved for optional secondary IP limits
    key = _lists_rl_key(identity_id=identity_id)
    window = settings.lists_rate_limit_window_seconds
    max_writes = settings.lists_rate_limit_max_writes
    try:
        count = await cache.incr(key, ttl_seconds=window)
    except CacheBackendError:
        logger.warning('lists rate limit falling back to process-local counter')
        count = await _local_rl_fallback.incr(key, ttl_seconds=window)
    if count > max_writes:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='Too many library updates. Try again later.',
        )
