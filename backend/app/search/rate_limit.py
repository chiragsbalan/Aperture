"""Search request rate limits via CacheBackend (Redis in P2.4).

Uses atomic ``incr`` with a fixed window (TTL set only on first hit).
When Redis ``incr`` fails, falls back to a process-local counter so limits
are not silently disabled (per-instance only while Redis is down).

Keys are ``search:rl:ip:{sha256(subject)}``. Missing/empty client IPs use the
shared ``unknown`` subject so limits still apply.
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


def _search_rl_key(client_ip: str | None) -> str:
    subject = (client_ip or '').strip() or 'unknown'
    return f'search:rl:ip:{hash_rate_limit_subject(subject)}'


def reset_search_rate_limit_fallback() -> None:
    """Clear process-local search RL fallback (tests)."""
    run_coro_sync(_local_rl_fallback.clear())


async def enforce_search_rate_limit(
    cache: CacheBackend,
    *,
    settings: Settings,
    client_ip: str | None,
) -> None:
    """Raise 429 when an IP exceeds the search request window."""
    key = _search_rl_key(client_ip)
    window = settings.search_rate_limit_window_seconds
    max_per_ip = settings.search_rate_limit_max_per_ip
    try:
        count = await cache.incr(key, ttl_seconds=window)
    except CacheBackendError:
        logger.warning('search rate limit falling back to process-local counter')
        count = await _local_rl_fallback.incr(key, ttl_seconds=window)
    if count > max_per_ip:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='Too many search requests. Try again later.',
        )
