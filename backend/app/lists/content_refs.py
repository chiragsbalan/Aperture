"""Normalize polymorphic content refs for list items (ADR-0004).

Public API types follow search: ``movie`` | ``tv``. Detail DTOs historically
emit ``tv_show``; accept that as an input alias. Persist
``content_items.content_type`` values (``movie`` | ``tv_show``).
"""

from __future__ import annotations

from typing import Literal

PublicContentType = Literal['movie', 'tv']
DbContentType = Literal['movie', 'tv_show']

_PUBLIC_TO_DB: dict[str, DbContentType] = {
    'movie': 'movie',
    'tv': 'tv_show',
    'tv_show': 'tv_show',
}

_DB_TO_PUBLIC: dict[str, PublicContentType] = {
    'movie': 'movie',
    'tv_show': 'tv',
}

SUPPORTED_PUBLIC_TYPES = frozenset({'movie', 'tv', 'tv_show'})


class UnsupportedContentTypeError(ValueError):
    """Raised when a content type cannot be stored on a list."""


def to_db_content_type(public_or_alias: str) -> DbContentType:
    """Map a public/alias type to a ``content_items.content_type`` value."""
    normalized = public_or_alias.strip().lower()
    mapped = _PUBLIC_TO_DB.get(normalized)
    if mapped is None:
        raise UnsupportedContentTypeError(
            f'unsupported content type: {public_or_alias}'
        )
    return mapped


def to_public_content_type(db_type: str) -> PublicContentType:
    """Map a persisted content type to the public list API type."""
    mapped = _DB_TO_PUBLIC.get(db_type)
    if mapped is None:
        raise UnsupportedContentTypeError(
            f'unsupported persisted content type: {db_type}'
        )
    return mapped
