"""Metadata resolve / ingest / landing rate limits via CacheBackend.

Uses atomic ``incr`` with a fixed window (TTL set only on first hit).
When Redis ``incr`` fails, falls back to a process-local counter so limits
are not silently disabled (per-instance only while Redis is down).

Keys are ``metadata:rl:resolve:ip:{sha256}``,
``metadata:rl:ingest:ip:{sha256}``,
``metadata:rl:landing:ip:{sha256}``, and
``metadata:rl:top-movies:ip:{sha256}``. Missing/empty client IPs use the shared
``unknown`` subject so limits still apply.

Client IP should come from ``resolve_client_ip`` (trusted
``X-Aperture-Client-IP`` when BFF secret matches; otherwise peer /
fallback). Do not trust raw ``X-Forwarded-For`` alone for these buckets.
"""

from __future__ import annotations

import logging

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

# Process-local fallback when shared Redis incr is unavailable.
_local_rl_fallback = InMemoryCacheBackend()


def _rl_key(bucket: str, client_ip: str | None) -> str:
    subject = (client_ip or '').strip() or 'unknown'
    return f'metadata:rl:{bucket}:ip:{hash_rate_limit_subject(subject)}'


def reset_metadata_rate_limit_fallback() -> None:
    """Clear process-local metadata RL fallback (tests)."""
    run_coro_sync(_local_rl_fallback.clear())


async def _enforce(
    cache: CacheBackend,
    *,
    client_ip: str | None,
    bucket: str,
    max_per_ip: int,
    window_seconds: int,
    detail: str,
) -> None:
    key = _rl_key(bucket, client_ip)
    try:
        count = await cache.incr(key, ttl_seconds=window_seconds)
    except CacheBackendError:
        logger.warning(
            'metadata %s rate limit falling back to process-local counter',
            bucket,
        )
        count = await _local_rl_fallback.incr(key, ttl_seconds=window_seconds)
    if count > max_per_ip:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
        )


async def enforce_resolve_rate_limit(
    cache: CacheBackend,
    *,
    settings: Settings,
    client_ip: str | None,
) -> None:
    """Raise 429 when an IP exceeds the resolve request window."""
    await _enforce(
        cache,
        client_ip=client_ip,
        bucket='resolve',
        max_per_ip=settings.metadata_resolve_rate_limit_max_per_ip,
        window_seconds=settings.metadata_resolve_rate_limit_window_seconds,
        detail='Too many resolve requests. Try again later.',
    )


async def enforce_resolve_ingest_rate_limit(
    cache: CacheBackend,
    *,
    settings: Settings,
    client_ip: str | None,
) -> None:
    """Raise 429 when an IP exceeds the resolve-ingest (TMDb miss) window."""
    await _enforce(
        cache,
        client_ip=client_ip,
        bucket='ingest',
        max_per_ip=settings.metadata_resolve_ingest_rate_limit_max_per_ip,
        window_seconds=settings.metadata_resolve_rate_limit_window_seconds,
        detail='Too many catalog ingest requests. Try again later.',
    )


async def enforce_landing_posters_rate_limit(
    cache: CacheBackend,
    *,
    settings: Settings,
    client_ip: str | None,
) -> None:
    """Raise 429 when an IP exceeds the landing posters request window."""
    await _enforce(
        cache,
        client_ip=client_ip,
        bucket='landing',
        max_per_ip=settings.landing_posters_rate_limit_max_per_ip,
        window_seconds=settings.landing_posters_rate_limit_window_seconds,
        detail='Too many landing poster requests. Try again later.',
    )


async def enforce_top_movies_rate_limit(
    cache: CacheBackend,
    *,
    settings: Settings,
    client_ip: str | None,
) -> None:
    """Raise 429 when an IP exceeds the top-movies request window."""
    await _enforce(
        cache,
        client_ip=client_ip,
        bucket='top-movies',
        max_per_ip=settings.top_movies_rate_limit_max_per_ip,
        window_seconds=settings.top_movies_rate_limit_window_seconds,
        detail='Too many top movies requests. Try again later.',
    )
