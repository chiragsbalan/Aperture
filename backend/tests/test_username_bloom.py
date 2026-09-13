"""Unit tests for DIY username bloom sizing and in-memory store."""

from __future__ import annotations

import pytest
from app.users.bloom import (
    InMemoryUsernameBloomStore,
    bloom_bit_count,
    bloom_hash_count,
    bloom_offsets,
)


def test_v1_sizing_matches_adr_defaults() -> None:
    m = bloom_bit_count(10_000, 0.01)
    k = bloom_hash_count(10_000, m)
    assert m == 95_851
    assert k == 7


@pytest.mark.asyncio
async def test_bloom_negative_never_false_positive_on_empty() -> None:
    store = InMemoryUsernameBloomStore(n=10_000, p=0.01)
    await store.rebuild([])
    assert await store.is_ready()
    assert await store.might_contain('fresh_handle') is False


@pytest.mark.asyncio
async def test_bloom_positive_after_add() -> None:
    store = InMemoryUsernameBloomStore(n=10_000, p=0.01)
    await store.rebuild(['alice', 'bob'])
    assert await store.might_contain('alice') is True
    assert await store.might_contain('bob') is True
    # Definite negative for a name never inserted (extremely likely).
    assert await store.might_contain('zzz_not_in_filter_99') is False


@pytest.mark.asyncio
async def test_bloom_unready_returns_none() -> None:
    store = InMemoryUsernameBloomStore(n=10_000, p=0.01)
    assert await store.might_contain('anyone') is None


def test_bloom_offsets_stable() -> None:
    a = bloom_offsets('filmfan', m=95_851, k=7)
    b = bloom_offsets('filmfan', m=95_851, k=7)
    assert a == b
    assert len(a) == 7
    assert all(0 <= offset < 95_851 for offset in a)
