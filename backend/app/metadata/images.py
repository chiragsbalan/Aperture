"""TMDb image URL helpers (CDN paths; no API key required)."""

from __future__ import annotations

import re

TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'
_DEFAULT_SIZE = 'w500'
_ALLOWED_SIZES = frozenset(
    {
        'w92',
        'w154',
        'w185',
        'w342',
        'w500',
        'w780',
        'original',
        'h632',
    }
)
# Relative TMDb paths look like ``/abc123.jpg`` (leading slash, no traversal).
_PATH_RE = re.compile(r'^/[A-Za-z0-9._\-]+(?:/[A-Za-z0-9._\-]+)*$')


class InvalidImagePathError(ValueError):
    """Raised when a poster/profile path fails validation."""


def normalize_image_path(path: str | None) -> str | None:
    """Return a validated relative image path, or ``None`` when empty.

    Rejects absolute URLs, scheme-relative URLs, and path traversal.
    """
    if path is None:
        return None
    cleaned = path.strip()
    if not cleaned:
        return None
    # Reject absolute / scheme-relative URLs (any ``scheme://`` or ``//host``).
    if '://' in cleaned or cleaned.startswith('//'):
        raise InvalidImagePathError('absolute image URLs are not allowed')
    if '..' in cleaned or '\\' in cleaned:
        raise InvalidImagePathError('path traversal is not allowed')
    if not cleaned.startswith('/'):
        cleaned = f'/{cleaned}'
    if not _PATH_RE.fullmatch(cleaned):
        raise InvalidImagePathError(f'invalid image path: {path!r}')
    return cleaned


def tmdb_image_url(
    path: str | None,
    *,
    size: str = _DEFAULT_SIZE,
) -> str | None:
    """Build a TMDb CDN URL from a relative path.

    Returns ``None`` when ``path`` is empty. Raises
    :class:`InvalidImagePathError` for unsafe paths or unknown sizes.
    """
    normalized = normalize_image_path(path)
    if normalized is None:
        return None
    if size not in _ALLOWED_SIZES:
        raise InvalidImagePathError(f'unsupported image size: {size!r}')
    return f'{TMDB_IMAGE_BASE}/{size}{normalized}'
