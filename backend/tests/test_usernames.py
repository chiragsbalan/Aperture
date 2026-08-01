"""Unit tests for username normalization rules."""

from __future__ import annotations

from app.users.usernames import is_valid_username, normalize_username


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
