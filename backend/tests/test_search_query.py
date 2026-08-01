"""Unit tests for search query normalization."""

from __future__ import annotations

import pytest
from app.search.query import (
    MAX_QUERY_LENGTH,
    SearchQueryError,
    normalize_search_query,
    parse_types_param,
)


def test_normalize_strips_and_collapses_whitespace() -> None:
    assert normalize_search_query('  fight   club  ') == 'fight club'


def test_normalize_rejects_empty() -> None:
    with pytest.raises(SearchQueryError):
        normalize_search_query('   ')
    with pytest.raises(SearchQueryError):
        normalize_search_query(None)


def test_normalize_rejects_oversized() -> None:
    with pytest.raises(SearchQueryError):
        normalize_search_query('x' * (MAX_QUERY_LENGTH + 1))


def test_parse_types_default_and_filter() -> None:
    assert parse_types_param(None) == frozenset({'movie', 'tv', 'person'})
    assert parse_types_param('movie,person') == frozenset({'movie', 'person'})


def test_parse_types_rejects_unknown() -> None:
    with pytest.raises(SearchQueryError):
        parse_types_param('movie,alien')
