"""Username normalization and validation helpers."""

from __future__ import annotations

import re

_USERNAME_RE = re.compile(r'^[a-z0-9_]{3,32}$')

# Paths / product words that must not be claimable as public handles.
RESERVED_USERNAMES = frozenset(
    {
        'admin',
        'administrator',
        'api',
        'auth',
        'account',
        'accounts',
        'login',
        'logout',
        'signup',
        'register',
        'settings',
        'me',
        'users',
        'u',
        'profile',
        'profiles',
        'static',
        'assets',
        'health',
        'support',
        'help',
        'about',
        'aperture',
        'null',
        'undefined',
        'root',
        'system',
        'mod',
        'moderator',
    }
)


def normalize_username(value: str) -> str:
    """Trim and lowercase a username candidate."""
    return value.strip().lower()


def is_valid_username(value: str) -> bool:
    """Return True when ``value`` matches locked username rules."""
    return _USERNAME_RE.fullmatch(value) is not None


def is_reserved_username(value: str) -> bool:
    """Return True when ``value`` is reserved (assumes already normalized)."""
    return value in RESERVED_USERNAMES


def username_from_display_names(
    given_name: str | None,
    family_name: str | None,
) -> str:
    """Build a username seed from Google given/family name parts."""
    parts: list[str] = []
    for raw in (given_name, family_name):
        if raw is None:
            continue
        cleaned = re.sub(r'[^a-z0-9_]+', '', raw.strip().lower().replace(' ', '_'))
        if cleaned:
            parts.append(cleaned)
    joined = '_'.join(parts).strip('_')
    if len(joined) < 3:
        return 'user'
    return joined[:32]


def username_with_unique_suffix(base: str, suffix: str) -> str:
    """Append ``_`` + ``suffix``, clamping to 32 chars."""
    cleaned_suffix = re.sub(r'[^a-z0-9]', '', suffix.lower())
    if not cleaned_suffix:
        cleaned_suffix = 'x'
    max_base = 32 - (1 + len(cleaned_suffix))
    if max_base < 1:
        return cleaned_suffix[:32]
    trimmed = base[:max_base].rstrip('_')
    if len(trimmed) < 1:
        trimmed = 'u'
    return f'{trimmed}_{cleaned_suffix}'
