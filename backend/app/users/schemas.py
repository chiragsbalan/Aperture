"""Pydantic request/response models for Users API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator, model_validator

from app.users.usernames import is_valid_username, normalize_username

Theme = Literal['system', 'light', 'dark']
Spoilers = Literal['show', 'hide']

BIO_MAX_LENGTH = 500
DISPLAY_NAME_MAX_LENGTH = 120
AVATAR_URL_MAX_LENGTH = 512
WEBSITE_URL_MAX_LENGTH = 512
LINK_LABEL_MAX_LENGTH = 40
LINK_URL_MAX_LENGTH = 512
MAX_PROFILE_LINKS = 3


def _require_https_url(value: str, *, field_name: str) -> str:
    cleaned = value.strip()
    parsed = urlparse(cleaned)
    if parsed.scheme != 'https' or not parsed.netloc:
        raise ValueError(f'{field_name} must be an https:// URL')
    return cleaned


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


class ProfileLink(BaseModel):
    """One optional labeled external link on a public profile."""

    label: str = Field(..., min_length=1, max_length=LINK_LABEL_MAX_LENGTH)
    url: str = Field(..., min_length=8, max_length=LINK_URL_MAX_LENGTH)

    @field_validator('label')
    @classmethod
    def label_trim(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError('label must not be empty')
        return trimmed[:LINK_LABEL_MAX_LENGTH]

    @field_validator('url')
    @classmethod
    def url_https(cls, value: str) -> str:
        return _require_https_url(value, field_name='url')


class ProfileCounts(BaseModel):
    """Public profile counters (distinct titles logged + social stubs)."""

    movies: int = 0
    shows: int = 0
    followers: int = 0
    following: int = 0


class ProfileResponse(BaseModel):
    """Own profile including preferences and rename cooldown metadata."""

    id: uuid.UUID
    username: str
    display_name: str | None
    bio: str | None
    avatar_url: str | None = None
    website_url: str | None = None
    links: list[ProfileLink] = Field(default_factory=list)
    preferences: PreferencesResponse
    username_changed_at: datetime | None
    username_rename_available_at: datetime | None


class PublicProfileResponse(BaseModel):
    """Public profile shell (profiles are always public; shelves may be gated)."""

    username: str
    display_name: str | None
    bio: str | None
    avatar_url: str | None = None
    website_url: str | None = None
    links: list[ProfileLink] = Field(default_factory=list)
    is_owner: bool = False
    counts: ProfileCounts = Field(default_factory=ProfileCounts)


class ProfilePatchRequest(BaseModel):
    """Partial own-profile update (optional nested preferences for atomic saves)."""

    username: str | None = Field(default=None, min_length=3, max_length=32)
    display_name: str | None = Field(default=None, max_length=DISPLAY_NAME_MAX_LENGTH)
    bio: str | None = Field(default=None, max_length=BIO_MAX_LENGTH)
    avatar_url: str | None = Field(default=None, max_length=AVATAR_URL_MAX_LENGTH)
    website_url: str | None = Field(default=None, max_length=WEBSITE_URL_MAX_LENGTH)
    links: list[ProfileLink] | None = Field(default=None, max_length=MAX_PROFILE_LINKS)
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

    @field_validator('avatar_url')
    @classmethod
    def avatar_https(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        return _require_https_url(trimmed, field_name='avatar_url')

    @field_validator('website_url')
    @classmethod
    def website_https(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        return _require_https_url(trimmed, field_name='website_url')

    @model_validator(mode='after')
    def links_cap(self) -> ProfilePatchRequest:
        if self.links is not None and len(self.links) > MAX_PROFILE_LINKS:
            raise ValueError(f'at most {MAX_PROFILE_LINKS} links')
        return self


def normalize_links(raw: Any) -> list[ProfileLink]:
    """Coerce stored JSONB links into validated ProfileLink rows."""
    if not isinstance(raw, list):
        return []
    links: list[ProfileLink] = []
    for item in raw[:MAX_PROFILE_LINKS]:
        if not isinstance(item, dict):
            continue
        label = item.get('label')
        url = item.get('url')
        if not isinstance(label, str) or not isinstance(url, str):
            continue
        try:
            links.append(ProfileLink(label=label, url=url))
        except ValueError:
            continue
    return links


class AvatarUploadUrlRequest(BaseModel):
    """Request a short-lived R2 presigned PUT for an avatar."""

    content_type: str = Field(..., min_length=8, max_length=64)
    byte_size: int = Field(..., ge=1)


class AvatarUploadUrlResponse(BaseModel):
    """Presigned upload grant + final CDN URL after confirm."""

    upload_url: str
    public_url: str
    key: str
    expires_in: int
    max_bytes: int
    content_type: str


class AvatarConfirmRequest(BaseModel):
    """Confirm a completed R2 PUT and attach it to the profile."""

    key: str = Field(..., min_length=8, max_length=256)
