"""DIY Redis BITFIELD / bit-array bloom for username availability (ADR-0018).

Sizing defaults (v1): ``n=10_000``, ``p=0.01``. Derive ``m`` / ``k`` from those.
Bloom negative may short-circuit to available; bloom positive must still
DB-confirm. Never treat bloom as sole source of truth.

TODO (ADR-0018 follow-up #1): optimize ``n`` / ``p`` from real cardinality and
false-positive / DB-hit metrics after ship. Do not leave v1 defaults forever
without evidence.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import math
from collections.abc import Iterable
from typing import Protocol

logger = logging.getLogger(__name__)

# Redis keys (BITFIELD / bit string + readiness flag).
BLOOM_BITS_KEY = 'users:username-bloom:v1:bits'
BLOOM_READY_KEY = 'users:username-bloom:v1:ready'

# v1 sizing defaults from ADR-0018 (also Settings defaults).
DEFAULT_BLOOM_N = 10_000
DEFAULT_BLOOM_P = 0.01


def bloom_bit_count(n: int, p: float) -> int:
    """Return bit-array length ``m`` for expected cardinality ``n`` and FPR ``p``."""
    cardinality = max(1, n)
    rate = p if 0.0 < p < 1.0 else DEFAULT_BLOOM_P
    return max(8, math.ceil(-cardinality * math.log(rate) / (math.log(2) ** 2)))


def bloom_hash_count(n: int, m: int) -> int:
    """Return hash count ``k`` for cardinality ``n`` and bit length ``m``."""
    cardinality = max(1, n)
    return max(1, round((m / cardinality) * math.log(2)))


def bloom_offsets(username: str, *, m: int, k: int) -> list[int]:
    """Double-hash positions for ``username`` into ``[0, m)``."""
    data = username.encode('utf-8')
    h1 = int.from_bytes(hashlib.sha256(data).digest()[:8], 'big')
    h2 = int.from_bytes(hashlib.blake2b(data, digest_size=8).digest(), 'big') or 1
    return [((h1 + i * h2) % m) for i in range(k)]


class UsernameBloomStore(Protocol):
    """Minimal bloom ops used by availability + register/rename hooks."""

    async def is_ready(self) -> bool:
        """True when the filter has been rebuilt and is safe to query."""

    async def might_contain(self, username: str) -> bool | None:
        """Return False (definite miss), True (maybe), or None if unready."""

    async def add(self, username: str) -> None:
        """Insert ``username`` (no-op when store is unready / closed)."""

    async def rebuild(self, usernames: Iterable[str]) -> None:
        """Replace the bit array from ``usernames`` and mark ready."""

    async def close(self) -> None:
        """Release resources."""


class InMemoryUsernameBloomStore:
    """Process-local bit array (tests / Redis-unavailable)."""

    def __init__(self, *, n: int, p: float) -> None:
        self._n = max(1, n)
        self._p = p if 0.0 < p < 1.0 else DEFAULT_BLOOM_P
        self._m = bloom_bit_count(self._n, self._p)
        self._k = bloom_hash_count(self._n, self._m)
        self._bits = bytearray((self._m + 7) // 8)
        self._ready = False
        self._lock = asyncio.Lock()

    @property
    def m(self) -> int:
        return self._m

    @property
    def k(self) -> int:
        return self._k

    async def is_ready(self) -> bool:
        async with self._lock:
            return self._ready

    def _get_bit(self, offset: int) -> bool:
        return bool(self._bits[offset // 8] & (1 << (offset % 8)))

    def _set_bit(self, offset: int) -> None:
        self._bits[offset // 8] |= 1 << (offset % 8)

    async def might_contain(self, username: str) -> bool | None:
        async with self._lock:
            if not self._ready:
                return None
            return all(
                self._get_bit(offset)
                for offset in bloom_offsets(username, m=self._m, k=self._k)
            )

    async def add(self, username: str) -> None:
        async with self._lock:
            if not self._ready:
                return
            for offset in bloom_offsets(username, m=self._m, k=self._k):
                self._set_bit(offset)

    async def rebuild(self, usernames: Iterable[str]) -> None:
        async with self._lock:
            self._bits = bytearray((self._m + 7) // 8)
            for raw in usernames:
                name = (raw or '').strip().lower()
                if not name:
                    continue
                for offset in bloom_offsets(name, m=self._m, k=self._k):
                    self._set_bit(offset)
            self._ready = True

    async def close(self) -> None:
        async with self._lock:
            self._ready = False
            self._bits = bytearray((self._m + 7) // 8)


class RedisUsernameBloomStore:
    """Redis SETBIT / GETBIT bloom (no RedisBloom module)."""

    def __init__(self, url: str, *, n: int, p: float) -> None:
        from redis.asyncio import Redis

        self._n = max(1, n)
        self._p = p if 0.0 < p < 1.0 else DEFAULT_BLOOM_P
        self._m = bloom_bit_count(self._n, self._p)
        self._k = bloom_hash_count(self._n, self._m)
        self._redis: Redis = Redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=2.0,
            socket_timeout=2.0,
            health_check_interval=30,
        )

    @property
    def m(self) -> int:
        return self._m

    @property
    def k(self) -> int:
        return self._k

    async def is_ready(self) -> bool:
        try:
            value = await self._redis.get(BLOOM_READY_KEY)
        except Exception:
            logger.warning('username bloom ready check failed', exc_info=True)
            return False
        return value == '1'

    async def might_contain(self, username: str) -> bool | None:
        if not await self.is_ready():
            return None
        offsets = bloom_offsets(username, m=self._m, k=self._k)
        try:
            pipe = self._redis.pipeline(transaction=False)
            for offset in offsets:
                pipe.getbit(BLOOM_BITS_KEY, offset)
            bits = await pipe.execute()
        except Exception:
            logger.warning(
                'username bloom getbit failed; skipping bloom',
                exc_info=True,
            )
            return None
        if not bits or any(bit is None for bit in bits):
            return None
        return all(int(bit) == 1 for bit in bits)

    async def add(self, username: str) -> None:
        if not await self.is_ready():
            return
        offsets = bloom_offsets(username, m=self._m, k=self._k)
        try:
            pipe = self._redis.pipeline(transaction=False)
            for offset in offsets:
                pipe.setbit(BLOOM_BITS_KEY, offset, 1)
            await pipe.execute()
        except Exception:
            logger.warning('username bloom setbit failed', exc_info=True)

    async def rebuild(self, usernames: Iterable[str]) -> None:
        names = [
            (raw or '').strip().lower() for raw in usernames if (raw or '').strip()
        ]
        try:
            pipe = self._redis.pipeline(transaction=True)
            pipe.delete(BLOOM_READY_KEY)
            pipe.delete(BLOOM_BITS_KEY)
            # Ensure key exists as a bit string before SETBIT batches.
            pipe.setbit(BLOOM_BITS_KEY, self._m - 1, 0)
            await pipe.execute()

            batch: list[int] = []
            for name in names:
                batch.extend(bloom_offsets(name, m=self._m, k=self._k))
                if len(batch) >= 500:
                    await self._set_offsets(batch)
                    batch = []
            if batch:
                await self._set_offsets(batch)
            await self._redis.set(BLOOM_READY_KEY, '1')
        except Exception:
            logger.warning('username bloom rebuild failed', exc_info=True)
            try:
                await self._redis.delete(BLOOM_READY_KEY)
            except Exception:
                logger.warning('username bloom ready clear failed', exc_info=True)

    async def _set_offsets(self, offsets: list[int]) -> None:
        pipe = self._redis.pipeline(transaction=False)
        for offset in offsets:
            pipe.setbit(BLOOM_BITS_KEY, offset, 1)
        await pipe.execute()

    async def close(self) -> None:
        try:
            await self._redis.aclose()
        except Exception:
            logger.warning('username bloom redis close failed', exc_info=True)


_bloom: UsernameBloomStore | None = None


def build_username_bloom(
    redis_url: str = '',
    *,
    n: int = DEFAULT_BLOOM_N,
    p: float = DEFAULT_BLOOM_P,
) -> UsernameBloomStore:
    """Create a bloom store; Redis when URL set, else in-memory."""
    cleaned = redis_url.strip()
    if not cleaned:
        store = InMemoryUsernameBloomStore(n=n, p=p)
        logger.info(
            'username bloom using in-memory store (m=%s k=%s)',
            store.m,
            store.k,
        )
        return store
    try:
        store = RedisUsernameBloomStore(cleaned, n=n, p=p)
        logger.info(
            'username bloom using Redis BITFIELD/SETBIT (m=%s k=%s)',
            store.m,
            store.k,
        )
        return store
    except Exception:
        logger.warning(
            'failed to init Redis username bloom; falling back to in-memory',
            exc_info=True,
        )
        return InMemoryUsernameBloomStore(n=n, p=p)


def get_username_bloom() -> UsernameBloomStore | None:
    """Return the process bloom singleton, or None if not initialized."""
    return _bloom


def init_username_bloom(
    redis_url: str = '',
    *,
    n: int = DEFAULT_BLOOM_N,
    p: float = DEFAULT_BLOOM_P,
    enabled: bool = True,
) -> UsernameBloomStore | None:
    """Replace the process bloom (app lifespan). None when disabled."""
    global _bloom
    if not enabled:
        _bloom = None
        return None
    _bloom = build_username_bloom(redis_url, n=n, p=p)
    return _bloom


async def shutdown_username_bloom() -> None:
    """Close the process bloom (app lifespan)."""
    global _bloom
    if _bloom is not None:
        await _bloom.close()
    _bloom = None


def reset_username_bloom() -> None:
    """Drop the process bloom singleton (tests)."""
    global _bloom
    previous = _bloom
    _bloom = None
    if previous is None:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(previous.close())
        return
    loop.create_task(previous.close())
