"""Cache key helpers for metadata detail payloads (P2.4)."""

from __future__ import annotations

import uuid


def movie_detail_key(content_id: uuid.UUID) -> str:
    return f'meta:movie:{content_id}'


def tv_detail_key(content_id: uuid.UUID) -> str:
    # v3: thin season graph + preferred-season episode embed (S1).
    return f'meta:tv:v3:{content_id}'


def person_detail_key(person_id: uuid.UUID) -> str:
    return f'meta:person:{person_id}'


def landing_top_posters_key(*, count: int) -> str:
    """Shared cache key for the anonymous landing poster mosaic."""
    return f'meta:landing:top-posters:{count}'


def top_movies_key(*, count: int) -> str:
    """Shared cache key for the signed-in home top-movies set."""
    return f'meta:top-movies:{count}'


def top_tv_shows_key(*, count: int) -> str:
    """Shared cache key for the signed-in home top-TV set."""
    return f'meta:top-tv-shows:{count}'


def now_in_theatres_key(*, count: int) -> str:
    """Shared cache key for the home now-in-theatres rail pool."""
    return f'meta:now-in-theatres:{count}'
