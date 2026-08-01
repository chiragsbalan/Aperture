"""Unit tests for list content-type normalization."""

from __future__ import annotations

import pytest
from app.common.content_refs import (
    UnsupportedContentTypeError,
    to_db_content_type,
    to_public_content_type,
)


def test_public_and_alias_map_to_db() -> None:
    assert to_db_content_type('movie') == 'movie'
    assert to_db_content_type('tv') == 'tv_show'
    assert to_db_content_type('tv_show') == 'tv_show'
    assert to_db_content_type('TV') == 'tv_show'


def test_db_maps_to_public() -> None:
    assert to_public_content_type('movie') == 'movie'
    assert to_public_content_type('tv_show') == 'tv'


def test_person_rejected() -> None:
    with pytest.raises(UnsupportedContentTypeError):
        to_db_content_type('person')
