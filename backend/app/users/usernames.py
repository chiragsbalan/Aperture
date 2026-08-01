"""Username normalization and validation (Users-owned)."""

from __future__ import annotations

import re

USERNAME_PATTERN = re.compile(r'^[a-z0-9_]{3,32}$')
_INVALID_USERNAME_CHARS = re.compile(r'[^a-z0-9_]+')


def normalize_username(raw: str) -> str:
    """Trim and lowercase a username candidate."""
    return raw.strip().lower()


def is_valid_username(normalized: str) -> bool:
    """Return True when ``normalized`` matches the locked username rules."""
    return USERNAME_PATTERN.fullmatch(normalized) is not None


def _clean_name_part(raw: str) -> str:
    """Lowercase and strip characters outside ``[a-z0-9_]``."""
    lowered = raw.strip().lower().replace(' ', '_')
    return _INVALID_USERNAME_CHARS.sub('', lowered)


def username_from_display_names(
    given_name: str | None,
    family_name: str | None,
) -> str:
    """Seed a username from Google given/family name.

    Joins cleaned parts with ``_``, clamps to ``[a-z0-9_]{3,32}``. Falls back
    to ``user`` when names are missing or too short after cleaning.
    """
    parts: list[str] = []
    for raw in (given_name, family_name):
        if raw is None:
            continue
        cleaned = _clean_name_part(raw)
        if cleaned:
            parts.append(cleaned)
    joined = '_'.join(parts)
    if len(joined) < 3:
        joined = 'user'
    if len(joined) > 32:
        joined = joined[:32]
    # Trailing underscores after truncate are fine; ensure min length still holds.
    if len(joined) < 3:
        joined = 'user'
    return joined


def username_with_unique_suffix(base: str, suffix: str) -> str:
    """Append ``_suffix`` to ``base``, truncating the stem to fit 32 chars."""
    cleaned_suffix = _clean_name_part(suffix) or 'x'
    max_stem = 32 - 1 - len(cleaned_suffix)
    if max_stem < 1:
        cleaned_suffix = cleaned_suffix[:28]
        max_stem = 32 - 1 - len(cleaned_suffix)
    stem = base[:max_stem].rstrip('_') or 'user'
    if len(stem) < 1:
        stem = 'u'
    candidate = f'{stem}_{cleaned_suffix}'
    if len(candidate) > 32:
        candidate = candidate[:32]
    if not is_valid_username(candidate):
        # Extremely defensive: force a valid fallback.
        padded = f'user_{cleaned_suffix}'[:32]
        if is_valid_username(padded):
            return padded
        return 'user'
    return candidate
