"""Username normalization and validation (Users-owned)."""

from __future__ import annotations

import re

USERNAME_PATTERN = re.compile(r'^[a-z0-9_]{3,32}$')


def normalize_username(raw: str) -> str:
    """Trim and lowercase a username candidate."""
    return raw.strip().lower()


def is_valid_username(normalized: str) -> bool:
    """Return True when ``normalized`` matches the locked username rules."""
    return USERNAME_PATTERN.fullmatch(normalized) is not None
