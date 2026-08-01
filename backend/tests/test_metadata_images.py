"""Unit tests for TMDb image path validation and URL building."""

from __future__ import annotations

import pytest
from app.metadata.images import (
    InvalidImagePathError,
    normalize_image_path,
    tmdb_image_url,
)


def test_normalize_accepts_relative_path() -> None:
    assert normalize_image_path('/abc123.jpg') == '/abc123.jpg'
    assert normalize_image_path('poster.jpg') == '/poster.jpg'
    assert normalize_image_path(None) is None
    assert normalize_image_path('  ') is None


def test_normalize_rejects_absolute_and_traversal() -> None:
    with pytest.raises(InvalidImagePathError):
        normalize_image_path('https://evil.example/x.jpg')
    with pytest.raises(InvalidImagePathError):
        normalize_image_path('http://evil.example/x.jpg')
    with pytest.raises(InvalidImagePathError):
        normalize_image_path('ftp://evil.example/x.jpg')
    with pytest.raises(InvalidImagePathError):
        normalize_image_path('//evil.example/x.jpg')
    with pytest.raises(InvalidImagePathError):
        normalize_image_path('/path/with://inside.jpg')
    with pytest.raises(InvalidImagePathError):
        normalize_image_path('/../secret.jpg')
    with pytest.raises(InvalidImagePathError):
        normalize_image_path('/foo/../../etc/passwd')


def test_tmdb_image_url_builds_cdn() -> None:
    assert (
        tmdb_image_url('/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg')
        == 'https://image.tmdb.org/t/p/w500/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg'
    )
    assert tmdb_image_url(None) is None
    with pytest.raises(InvalidImagePathError):
        tmdb_image_url('/x.jpg', size='w999')
