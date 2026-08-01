"""Cache key helpers for personal library summaries."""

from __future__ import annotations

import uuid


def system_list_key(*, user_id: uuid.UUID, kind: str) -> str:
    """Return the Redis/in-memory key for a system list summary."""
    return f'user:{user_id}:{kind}'
