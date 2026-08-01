"""Unit tests for username normalization rules."""

from __future__ import annotations

from app.users.usernames import (
    is_reserved_username,
    is_valid_username,
    normalize_username,
    username_from_display_names,
    username_with_unique_suffix,
)


def test_normalize_username() -> None:
    assert normalize_username('  FilmFan_01 ') == 'filmfan_01'


def test_valid_usernames() -> None:
    assert is_valid_username('abc')
    assert is_valid_username('a' * 32)
    assert is_valid_username('film_fan_01')


def test_invalid_usernames() -> None:
    assert not is_valid_username('ab')
    assert not is_valid_username('a' * 33)
    assert not is_valid_username('FilmFan')
    assert not is_valid_username('bad-name')
    assert not is_valid_username('has space')


def test_reserved_usernames() -> None:
    assert is_reserved_username('admin')
    assert is_reserved_username('settings')
    assert is_reserved_username('u')
    assert is_reserved_username('movies')
    assert is_reserved_username('tv')
    assert is_reserved_username('people')
    assert is_reserved_username('search')
    assert not is_reserved_username('ada_lovelace')
    assert not is_reserved_username('user')


def test_username_from_display_names() -> None:
    assert username_from_display_names('Ada', 'Lovelace') == 'ada_lovelace'
    assert username_from_display_names('Ada', None) == 'ada'
    assert username_from_display_names(None, None) == 'user'
    assert username_from_display_names('A', None) == 'user'
    assert username_from_display_names('A', 'B') == 'a_b'
    assert username_from_display_names('José', "O'Brien") == 'jos_obrien'
    long_given = 'a' * 40
    assert len(username_from_display_names(long_given, None)) == 32


def test_username_with_unique_suffix() -> None:
    candidate = username_with_unique_suffix('ada_lovelace', 'abc123')
    assert candidate == 'ada_lovelace_abc123'
    assert is_valid_username(candidate)
    long_base = 'a' * 32
    suffixed = username_with_unique_suffix(long_base, 'ffff')
    assert len(suffixed) <= 32
    assert is_valid_username(suffixed)
    assert suffixed.endswith('_ffff')
