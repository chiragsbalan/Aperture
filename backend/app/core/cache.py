"""Process-local cache backend (P1); Redis implementation lands in P2.4."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Protocol


class CacheBackend(Protocol):
    """Minimal async key/value cache with TTL."""

    async def get(self, key: str) -> str | None:
        """Return the cached string value, or ``None`` if missing/expired."""

    async def set(self, key: str, value: str, *, ttl_seconds: int) -> None:
        """Store ``value`` under ``key`` for ``ttl_seconds``."""

    async def delete(self, key: str) -> None:
        """Remove ``key`` if present."""


@dataclass
class _CacheEntry:
    value: str
    expires_at: float


class InMemoryCacheBackend:
    """Single-process TTL cache. Suitable for Render Free (one instance)."""

    def __init__(self) -> None:
        self._entries: dict[str, _CacheEntry] = {}

    async def get(self, key: str) -> str | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        if entry.expires_at <= time.monotonic():
            self._entries.pop(key, None)
            return None
        return entry.value

    async def set(self, key: str, value: str, *, ttl_seconds: int) -> None:
        if ttl_seconds <= 0:
            self._entries.pop(key, None)
            return
        self._entries[key] = _CacheEntry(
            value=value,
            expires_at=time.monotonic() + ttl_seconds,
        )

    async def delete(self, key: str) -> None:
        self._entries.pop(key, None)

    def clear(self) -> None:
        """Drop all entries (tests)."""
        self._entries.clear()


_cache: InMemoryCacheBackend | None = None


def get_cache() -> InMemoryCacheBackend:
    """Return the process-wide in-memory cache singleton."""
    global _cache
    if _cache is None:
        _cache = InMemoryCacheBackend()
    return _cache


def reset_cache() -> None:
    """Replace the process cache (tests / lifespan teardown)."""
    global _cache
    if _cache is not None:
        _cache.clear()
    _cache = InMemoryCacheBackend()
