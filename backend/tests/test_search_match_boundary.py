"""Unit tests for substring word-boundary helper used in search recall."""

from __future__ import annotations

from app.metadata.repository import _has_word_boundary_match


def test_word_boundary_match_for_standalone_token() -> None:
    assert _has_word_boundary_match('minions: rise of gru', 'gru')
    assert _has_word_boundary_match('gru', 'gru')
    assert _has_word_boundary_match('the gru chronicles', 'gru')


def test_embedded_sequence_is_not_word_boundary() -> None:
    assert not _has_word_boundary_match('grunge wars', 'gru')
    assert not _has_word_boundary_match('agru', 'gru')


def test_empty_needle() -> None:
    assert not _has_word_boundary_match('gru', '')
