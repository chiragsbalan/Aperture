"""Pydantic request/response models for Users API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.users.usernames import is_valid_username, normalize_username

Theme = Literal['system', 'light', 'dark']
Spoilers = Literal['show', 'hide']

BIO_MAX_LENGTH = 500
DISPLAY_NAME_MAX_LENGTH = 120


class PreferencesResponse(BaseModel):
    """Stored preference bag (theme / spoilers / language stub)."""

    theme: Theme
    spoilers: Spoilers
    language: str


class PreferencesPatchRequest(BaseModel):
    """Partial preferences update."""

    theme: Theme | None = None
    spoilers: Spoilers | None = None
    language: str | None = Field(default=None, min_length=2, max_length=16)

    @field_validator('language')
    @classmethod
    def language_stub(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().lower()
        if not (2 <= len(cleaned) <= 16 and cleaned.replace('-', '').isalnum()):
            raise ValueError('language must be a short locale stub (e.g. en)')
        return cleaned


class ProfileResponse(BaseModel):
    """Own profile including preferences and rename cooldown metadata."""

    id: uuid.UUID
    username: str
    display_name: str | None
    bio: str | None
    preferences: PreferencesResponse
    username_changed_at: datetime | None
    username_rename_available_at: datetime | None


class PublicProfileResponse(BaseModel):
    """Minimal public profile fields."""

    username: str
    display_name: str | None
    bio: str | None


class ProfilePatchRequest(BaseModel):
    """Partial own-profile update (optional nested preferences for atomic saves)."""

    username: str | None = Field(default=None, min_length=3, max_length=32)
    display_name: str | None = Field(default=None, max_length=DISPLAY_NAME_MAX_LENGTH)
    bio: str | None = Field(default=None, max_length=BIO_MAX_LENGTH)
    preferences: PreferencesPatchRequest | None = None

    @field_validator('username')
    @classmethod
    def username_rules(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = normalize_username(value)
        if not is_valid_username(normalized):
            raise ValueError('username must be 3-32 chars: a-z, 0-9, underscore')
        return normalized

    @field_validator('display_name')
    @classmethod
    def display_name_trim(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        return trimmed[:DISPLAY_NAME_MAX_LENGTH]

    @field_validator('bio')
    @classmethod
    def bio_trim(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        if len(trimmed) > BIO_MAX_LENGTH:
            raise ValueError(f'bio must be at most {BIO_MAX_LENGTH} characters')
        return trimmed
