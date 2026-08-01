"""Default and validation helpers for user preferences."""

from __future__ import annotations

from typing import TypedDict

Theme = str  # 'system' | 'light' | 'dark'
Spoilers = str  # 'show' | 'hide'


class PreferencesDict(TypedDict):
    """Normalized preferences document stored in JSONB."""

    theme: str
    spoilers: str
    language: str


DEFAULT_THEME = 'system'
DEFAULT_SPOILERS = 'show'
DEFAULT_LANGUAGE = 'en'

DEFAULT_PREFERENCES: PreferencesDict = {
    'theme': DEFAULT_THEME,
    'spoilers': DEFAULT_SPOILERS,
    'language': DEFAULT_LANGUAGE,
}

_VALID_THEMES = frozenset({'system', 'light', 'dark'})
_VALID_SPOILERS = frozenset({'show', 'hide'})


def normalize_preferences(raw: object | None) -> PreferencesDict:
    """Merge stored preferences with defaults; drop unknown keys."""
    base: PreferencesDict = {
        'theme': DEFAULT_THEME,
        'spoilers': DEFAULT_SPOILERS,
        'language': DEFAULT_LANGUAGE,
    }
    if not isinstance(raw, dict):
        return base
    theme = raw.get('theme')
    if isinstance(theme, str) and theme in _VALID_THEMES:
        base['theme'] = theme
    spoilers = raw.get('spoilers')
    if isinstance(spoilers, str) and spoilers in _VALID_SPOILERS:
        base['spoilers'] = spoilers
    language = raw.get('language')
    if isinstance(language, str):
        cleaned = language.strip().lower()
        if 2 <= len(cleaned) <= 16 and cleaned.replace('-', '').isalnum():
            base['language'] = cleaned
    return base


def merge_preference_patch(
    current: PreferencesDict,
    *,
    theme: str | None = None,
    spoilers: str | None = None,
    language: str | None = None,
) -> PreferencesDict:
    """Apply a partial preferences update onto ``current``."""
    patch: dict[str, str] = {}
    if theme is not None:
        patch['theme'] = theme
    if spoilers is not None:
        patch['spoilers'] = spoilers
    if language is not None:
        patch['language'] = language
    merged = {**current, **patch}
    return normalize_preferences(merged)
