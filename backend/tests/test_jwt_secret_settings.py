"""Production JWT_SECRET / AUTH_BFF_SHARED_SECRET fail-fast validation."""

from __future__ import annotations

import pytest
from app.core.config import Settings
from pydantic import ValidationError

_STRONG_JWT = 'prod-grade-secret-value-with-enough-entropy-01'
_STRONG_BFF = 'prod-grade-bff-shared-secret-with-entropy-02'


def _base_kwargs() -> dict[str, str]:
    return {
        'database_url': (
            'postgresql+asyncpg://aperture:aperture@localhost:5432/aperture'
        ),
    }


def test_local_environment_allows_short_jwt_secret() -> None:
    settings = Settings(
        **_base_kwargs(),
        environment='local',
        jwt_secret='short',
    )
    assert settings.jwt_secret == 'short'


def test_production_rejects_short_jwt_secret() -> None:
    with pytest.raises(ValidationError, match='at least 32 characters'):
        Settings(
            **_base_kwargs(),
            environment='production',
            jwt_secret='too-short-for-production',
            auth_bff_shared_secret=_STRONG_BFF,
        )


def test_production_rejects_placeholder_jwt_secret() -> None:
    with pytest.raises(ValidationError, match='placeholder|change-me'):
        Settings(
            **_base_kwargs(),
            environment='production',
            jwt_secret='local-dev-only-change-me-before-any-real-use',
            auth_bff_shared_secret=_STRONG_BFF,
        )


def test_production_rejects_short_bff_secret() -> None:
    with pytest.raises(ValidationError, match='AUTH_BFF_SHARED_SECRET'):
        Settings(
            **_base_kwargs(),
            environment='production',
            jwt_secret=_STRONG_JWT,
            auth_bff_shared_secret='too-short',
        )


def test_production_accepts_strong_secrets() -> None:
    settings = Settings(
        **_base_kwargs(),
        environment='production',
        jwt_secret=_STRONG_JWT,
        auth_bff_shared_secret=_STRONG_BFF,
    )
    assert settings.jwt_secret == _STRONG_JWT
    assert settings.auth_bff_shared_secret == _STRONG_BFF


def test_staging_skips_production_jwt_checks() -> None:
    settings = Settings(
        **_base_kwargs(),
        environment='staging',
        jwt_secret='short',
    )
    assert settings.environment == 'staging'
