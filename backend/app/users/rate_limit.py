"""Users rate limits via CacheBackend (public reads + avatar writes).

Uses atomic ``incr`` with a fixed window (TTL set only on first hit).
When Redis ``incr`` fails, falls back to a process-local counter so limits
are not silently disabled (per-instance only while Redis is down).

Public keys: ``users:rl:public:ip:{sha256(subject)}``.
Avatar keys: ``users:rl:avatar:id:{sha256(identity_id)}``.

Client IP should come from ``resolve_client_ip`` (trusted
``X-Aperture-Client-IP`` when the BFF secret matches).
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


def _public_rl_key(client_ip: str | None) -> str:
    subject = (client_ip or '').strip() or 'unknown'
    return f'users:rl:public:ip:{hash_rate_limit_subject(subject)}'


def _avatar_rl_key(*, identity_id: uuid.UUID) -> str:
    return f'users:rl:avatar:id:{hash_rate_limit_subject(str(identity_id))}'


def reset_users_public_rate_limit_fallback() -> None:
    """Clear process-local public-profile RL fallback (tests)."""
    run_coro_sync(_local_rl_fallback.clear())


def reset_avatar_rate_limit_fallback() -> None:
    """Clear process-local avatar RL fallback (tests)."""
    run_coro_sync(_local_rl_fallback.clear())


async def enforce_users_public_rate_limit(
    cache: CacheBackend,
    *,
    settings: Settings,
    client_ip: str | None,
) -> None:
    """Raise 429 when an IP exceeds the public profile/diary window."""
    key = _public_rl_key(client_ip)
    window = settings.users_public_rate_limit_window_seconds
    max_per_ip = settings.users_public_rate_limit_max_per_ip
    try:
        count = await cache.incr(key, ttl_seconds=window)
    except CacheBackendError:
        logger.warning(
            'users public rate limit falling back to process-local counter',
        )
        count = await _local_rl_fallback.incr(key, ttl_seconds=window)
    if count > max_per_ip:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='Too many profile requests. Try again later.',
        )


async def enforce_avatar_write_rate_limit(
    cache: CacheBackend,
    *,
    settings: Settings,
    identity_id: uuid.UUID,
) -> None:
    """Raise 429 when an identity exceeds avatar upload/confirm/delete window."""
    key = _avatar_rl_key(identity_id=identity_id)
    window = settings.avatar_rate_limit_window_seconds
    max_writes = settings.avatar_rate_limit_max_writes
    try:
        count = await cache.incr(key, ttl_seconds=window)
    except CacheBackendError:
        logger.warning(
            'avatar rate limit falling back to process-local counter',
        )
        count = await _local_rl_fallback.incr(key, ttl_seconds=window)
    if count > max_writes:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='Too many avatar updates. Try again later.',
        )
