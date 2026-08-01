"""Unit tests for CacheBackend implementations."""

from __future__ import annotations

import pytest
from app.core.cache import (
    CacheBackendError,
    InMemoryCacheBackend,
    build_cache,
)
from app.core.config import Settings
from app.core.security import hash_rate_limit_subject
from app.search.rate_limit import _search_rl_key, enforce_search_rate_limit
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_in_memory_roundtrip_and_ttl() -> None:
    cache = InMemoryCacheBackend()
    await cache.set('k', 'v', ttl_seconds=60)
    assert await cache.get('k') == 'v'
    await cache.delete('k')
    assert await cache.get('k') is None


@pytest.mark.asyncio
async def test_in_memory_incr_fixed_window() -> None:
    cache = InMemoryCacheBackend()
    assert await cache.incr('rl', ttl_seconds=60) == 1
    assert await cache.incr('rl', ttl_seconds=60) == 2
    assert await cache.incr('rl', ttl_seconds=60) == 3


@pytest.mark.asyncio
async def test_build_cache_empty_url_is_memory() -> None:
    cache = build_cache('')
    assert isinstance(cache, InMemoryCacheBackend)
    await cache.close()


class _FailingIncrCache(InMemoryCacheBackend):
    """Memory cache whose incr always fails (simulates Redis outage)."""

    async def incr(self, key: str, *, ttl_seconds: int) -> int:
        raise CacheBackendError('simulated redis incr failure')


@pytest.mark.asyncio
async def test_search_rl_falls_back_when_incr_fails() -> None:
    settings = Settings(
        database_url='postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
        jwt_secret='unit-test-secret-at-least-32-bytes-long',
        search_rate_limit_max_per_ip=2,
        search_rate_limit_window_seconds=60,
    )
    cache = _FailingIncrCache()
    await enforce_search_rate_limit(
        cache, settings=settings, client_ip='203.0.113.9'
    )
    await enforce_search_rate_limit(
        cache, settings=settings, client_ip='203.0.113.9'
    )
    with pytest.raises(HTTPException) as exc_info:
        await enforce_search_rate_limit(
            cache, settings=settings, client_ip='203.0.113.9'
        )
    assert exc_info.value.status_code == 429


def test_search_rl_key_is_hashed() -> None:
    ip = '203.0.113.9'
    assert _search_rl_key(ip) == (
        f'search:rl:ip:{hash_rate_limit_subject(ip)}'
    )
    assert ip not in _search_rl_key(ip)


def test_search_rl_key_unknown_bucket() -> None:
    expected = f'search:rl:ip:{hash_rate_limit_subject("unknown")}'
    assert _search_rl_key(None) == expected
    assert _search_rl_key('') == expected
    assert _search_rl_key('   ') == expected


@pytest.mark.asyncio
async def test_search_rl_enforces_unknown_bucket() -> None:
    settings = Settings(
        database_url='postgresql+asyncpg://aperture:aperture@localhost:5432/aperture',
        jwt_secret='unit-test-secret-at-least-32-bytes-long',
        search_rate_limit_max_per_ip=2,
        search_rate_limit_window_seconds=60,
    )
    cache = InMemoryCacheBackend()
    await enforce_search_rate_limit(cache, settings=settings, client_ip=None)
    await enforce_search_rate_limit(cache, settings=settings, client_ip='  ')
    with pytest.raises(HTTPException) as exc_info:
        await enforce_search_rate_limit(
            cache, settings=settings, client_ip=None
        )
    assert exc_info.value.status_code == 429


@pytest.mark.asyncio
async def test_in_memory_clear_empties_entries() -> None:
    cache = InMemoryCacheBackend()
    await cache.set('k', 'v', ttl_seconds=60)
    await cache.clear()
    assert await cache.get('k') is None
