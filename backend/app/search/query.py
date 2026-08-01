"""Query normalization helpers for catalog search."""

from __future__ import annotations

MAX_QUERY_LENGTH = 100
MIN_QUERY_LENGTH = 1


class SearchQueryError(ValueError):
    """Invalid search query from the client."""


def normalize_search_query(raw: str | None) -> str:
    """Strip and validate ``q``; raise ``SearchQueryError`` when invalid."""
    if raw is None:
        raise SearchQueryError('q is required')
    cleaned = ' '.join(raw.strip().split())
    if len(cleaned) < MIN_QUERY_LENGTH:
        raise SearchQueryError('q must not be empty')
    if len(cleaned) > MAX_QUERY_LENGTH:
        raise SearchQueryError(f'q must be at most {MAX_QUERY_LENGTH} characters')
    return cleaned


def parse_types_param(raw: str | None) -> frozenset[str]:
    """Parse ``types=movie,tv,person`` into a frozenset of allowed kinds."""
    allowed = {'movie', 'tv', 'person'}
    if raw is None or not raw.strip():
        return frozenset(allowed)
    parts = {part.strip().lower() for part in raw.split(',') if part.strip()}
    unknown = parts - allowed
    if unknown:
        raise SearchQueryError(
            f'unsupported types: {", ".join(sorted(unknown))}'
        )
    if not parts:
        return frozenset(allowed)
    return frozenset(parts)
