"""Pydantic request/response models for Auth API."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.users.usernames import is_valid_username, normalize_username


class RegisterRequest(BaseModel):
    """Register with email, username, and password."""

    email: EmailStr
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)

    @field_validator('username')
    @classmethod
    def username_rules(cls, value: str) -> str:
        normalized = normalize_username(value)
        if not is_valid_username(normalized):
            raise ValueError('username must be 3-32 chars: a-z, 0-9, underscore')
        return normalized

    @field_validator('password')
    @classmethod
    def password_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError('password must not be blank')
        return value


class LoginRequest(BaseModel):
    """Login with email or username plus password."""

    identifier: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=128)

    @field_validator('identifier')
    @classmethod
    def identifier_not_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError('identifier must not be blank')
        return trimmed


class RefreshRequest(BaseModel):
    """Rotate refresh token (body carries opaque refresh for cookie-agnostic API)."""

    refresh_token: str = Field(min_length=1, max_length=512)


class LogoutRequest(BaseModel):
    """Revoke the current refresh session."""

    refresh_token: str = Field(min_length=1, max_length=512)


class TokenResponse(BaseModel):
    """Tokens returned to the BFF (not set as browser cookies by the API)."""

    access_token: str
    refresh_token: str
    token_type: Literal['bearer'] = 'bearer'
    expires_in: int


class UserSummary(BaseModel):
    """Minimal user profile fields for ``/auth/me``."""

    id: uuid.UUID
    username: str | None
    display_name: str | None
    avatar_url: str | None = None


class MeResponse(BaseModel):
    """Current identity + linked profile summary."""

    identity_id: uuid.UUID
    email: str
    user: UserSummary | None
    providers: list[Literal['password', 'google']]


class GoogleAuthRequest(BaseModel):
    """Verified Google claims forwarded by the BFF (never from the browser)."""

    sub: str = Field(min_length=1, max_length=255)
    email: EmailStr
    given_name: str | None = Field(default=None, max_length=120)
    family_name: str | None = Field(default=None, max_length=120)
    picture: str | None = Field(default=None, max_length=512)
    intent: Literal['sign_in', 'link'] = 'sign_in'

    @field_validator('sub')
    @classmethod
    def sub_not_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError('sub must not be blank')
        return trimmed

    @field_validator('given_name', 'family_name')
    @classmethod
    def optional_name_trim(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed if trimmed else None

    @field_validator('picture')
    @classmethod
    def optional_picture_trim(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed if trimmed else None
