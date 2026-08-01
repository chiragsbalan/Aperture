"""Cache backend: in-memory (default) or Redis when ``REDIS_URL`` is set (P2.4)."""

from __future__ import annotations

import asyncio
import concurrent.futures
import logging
import time
from collections.abc import Awaitable, Coroutine
from dataclasses import dataclass
from typing import Protocol

logger = logging.getLogger(__name__)

# Atomic INCR + EXPIRE-only-on-create for rate-limit windows.
_REDIS_INCR_LUA = """
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return n
"""


class CacheBackendError(Exception):
    """Raised when a cache op fails and the caller must degrade explicitly."""


class CacheBackend(Protocol):
    """Minimal async key/value cache with TTL and atomic incr."""

    async def get(self, key: str) -> str | None:
        """Return the cached string value, or ``None`` if missing/expired."""

    async def set(self, key: str, value: str, *, ttl_seconds: int) -> None:
        """Store ``value`` under ``key`` for ``ttl_seconds``."""

    async def delete(self, key: str) -> None:
        """Remove ``key`` if present."""

    async def incr(self, key: str, *, ttl_seconds: int) -> int:
        """Atomically increment; set TTL only when the key is created.

        Returns the value after increment. Raises ``CacheBackendError`` when
        the backend cannot complete the operation (rate-limit callers fall back).
        """

    async def close(self) -> None:
        """Release underlying resources (no-op for in-memory)."""


@dataclass
class _CacheEntry:
    value: str
    expires_at: float


class InMemoryCacheBackend:
    """Single-process TTL cache (tests / Redis-unavailable / RL fallback)."""

    def __init__(self) -> None:
        self._entries: dict[str, _CacheEntry] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> str | None:
        async with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if entry.expires_at <= time.monotonic():
                self._entries.pop(key, None)
                return None
            return entry.value

    async def set(self, key: str, value: str, *, ttl_seconds: int) -> None:
        async with self._lock:
            if ttl_seconds <= 0:
                self._entries.pop(key, None)
                return
            self._entries[key] = _CacheEntry(
                value=value,
                expires_at=time.monotonic() + ttl_seconds,
            )

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._entries.pop(key, None)

    async def incr(self, key: str, *, ttl_seconds: int) -> int:
        async with self._lock:
            now = time.monotonic()
            entry = self._entries.get(key)
            if entry is None or entry.expires_at <= now:
                self._entries[key] = _CacheEntry(
                    value='1',
                    expires_at=now + max(ttl_seconds, 1),
                )
                return 1
            try:
                count = int(entry.value) + 1
            except ValueError:
                count = 1
            # Keep original expiry (fixed window from first incr).
            self._entries[key] = _CacheEntry(
                value=str(count),
                expires_at=entry.expires_at,
            )
            return count

    async def close(self) -> None:
        """No resources to release."""

    async def clear(self) -> None:
        """Drop all entries (tests)."""
        async with self._lock:
            self._entries.clear()


class RedisCacheBackend:
    """Redis-backed cache.

    Metadata get/set/delete degrade to miss/no-op on errors.
    ``incr`` raises ``CacheBackendError`` so rate limits can fall back locally.
    """

    def __init__(self, url: str) -> None:
        from redis.asyncio import Redis

        self._redis: Redis = Redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=2.0,
            socket_timeout=2.0,
            health_check_interval=30,
        )

    async def get(self, key: str) -> str | None:
        try:
            value = await self._redis.get(key)
        except Exception:
            logger.warning('redis get failed; treating as cache miss', exc_info=True)
            return None
        if value is None:
            return None
        return str(value)

    async def set(self, key: str, value: str, *, ttl_seconds: int) -> None:
        if ttl_seconds <= 0:
            await self.delete(key)
            return
        try:
            await self._redis.set(key, value, ex=ttl_seconds)
        except Exception:
            logger.warning('redis set failed; continuing without cache', exc_info=True)

    async def delete(self, key: str) -> None:
        try:
            await self._redis.delete(key)
        except Exception:
            logger.warning('redis delete failed; continuing', exc_info=True)

    async def incr(self, key: str, *, ttl_seconds: int) -> int:
        try:
            raw = await self._redis.eval(
                _REDIS_INCR_LUA,
                1,
                key,
                str(max(ttl_seconds, 1)),
            )
            return int(raw)
        except Exception as exc:
            logger.warning('redis incr failed', exc_info=True)
            raise CacheBackendError('redis incr failed') from exc

    async def close(self) -> None:
        try:
            await self._redis.aclose()
        except Exception:
            logger.warning('redis close failed', exc_info=True)


_cache: CacheBackend | None = None


def build_cache(redis_url: str = '') -> CacheBackend:
    """Create a cache backend from an optional Redis URL."""
    cleaned = redis_url.strip()
    if not cleaned:
        return InMemoryCacheBackend()
    try:
        return RedisCacheBackend(cleaned)
    except Exception:
        logger.warning(
            'failed to init Redis cache; falling back to in-memory',
            exc_info=True,
        )
        return InMemoryCacheBackend()


def get_cache() -> CacheBackend:
    """Return the process-wide cache singleton."""
    global _cache
    if _cache is None:
        _cache = InMemoryCacheBackend()
    return _cache


def init_cache(redis_url: str = '') -> CacheBackend:
    """Replace the process cache (app lifespan)."""
    global _cache
    _cache = build_cache(redis_url)
    return _cache


async def shutdown_cache() -> None:
    """Close the process cache (app lifespan)."""
    global _cache
    if _cache is not None:
        await _cache.close()
    _cache = None


def run_coro_sync[T](coro: Coroutine[object, object, T]) -> T:
    """Run ``coro`` from sync code; wait even if a loop is already running."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


async def _await_none(awaitable: Awaitable[None]) -> None:
    await awaitable


def _schedule_coro(coro: Awaitable[None]) -> None:
    """Best-effort schedule of async cleanup (do not block the caller)."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(_await_none(coro))
        return
    loop.create_task(_await_none(coro))


def reset_cache() -> None:
    """Replace the process cache with a fresh in-memory backend (tests)."""
    global _cache
    previous = _cache
    _cache = InMemoryCacheBackend()
    if previous is None:
        return
    if isinstance(previous, InMemoryCacheBackend):
        run_coro_sync(previous.clear())
        return
    # Best-effort close of a previous Redis (or other) backend.
    _schedule_coro(previous.close())
