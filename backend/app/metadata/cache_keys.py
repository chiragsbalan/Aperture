"""Cache key helpers for metadata detail payloads (P2.4)."""

from __future__ import annotations

import uuid


def movie_detail_key(content_id: uuid.UUID) -> str:
    return f'meta:movie:{content_id}'


def tv_detail_key(content_id: uuid.UUID) -> str:
    return f'meta:tv:{content_id}'


def person_detail_key(person_id: uuid.UUID) -> str:
    return f'meta:person:{person_id}'
