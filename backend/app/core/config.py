"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path
from typing import Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_REPO_ROOT = _BACKEND_DIR.parent

# Exact matches (case-insensitive) rejected when ENVIRONMENT=production.
_JWT_SECRET_PLACEHOLDERS = frozenset(
    {
        'change-me',
        'secret',
        'jwt-secret',
        'your-secret-here',
        'local-dev-only-change-me-before-any-real-use',
        'test-jwt-secret-not-for-production-use-32b',
        'unit-test-secret-at-least-32-bytes-long',
    }
)

_BFF_SECRET_PLACEHOLDERS = frozenset(
    {
        'change-me',
        'secret',
        'local-dev-bff-shared-secret-change-me',
    }
)


class Settings(BaseSettings):
    """Runtime configuration. Fail fast on invalid types."""

    model_config = SettingsConfigDict(
        # Repo-root .env first; backend/.env can override for local overrides.
        env_file=(
            str(_REPO_ROOT / '.env'),
            str(_BACKEND_DIR / '.env'),
        ),
        env_file_encoding='utf-8',
        extra='ignore',
    )

    app_name: str = 'Aperture'
    app_version: str = '0.1.0'
    environment: str = 'local'
    api_v1_prefix: str = '/api/v1'
    log_level: str = 'INFO'
    database_url: str
    # Comma-separated browser origins. Empty (default) = no CORS middleware;
    # browsers should use the Next.js BFF (`/api/proxy/...`), not the API directly.
    cors_origins: str = ''

    # Auth (ADR-0005). Set a strong secret in production (Render dashboard).
    jwt_secret: str
    jwt_algorithm: str = 'HS256'
    access_token_ttl_seconds: int = 900  # 15 minutes
    refresh_token_ttl_seconds: int = 60 * 60 * 24 * 30  # 30 days
    # Parallel-tab refresh reuse window; outside → revoke refresh family (P1.2).
    refresh_reuse_grace_seconds: int = 10

    # Auth rate limits (DB-backed counters; single Render instance until Redis).
    auth_rate_limit_window_seconds: int = 15 * 60
    auth_login_max_failures: int = 10
    auth_register_max_failures: int = 5
    # Cap is failure-only (invalid / outside-grace), not every refresh call.
    auth_refresh_max_per_ip: int = 30
    # Google OAuth API abuse cap per trusted client IP (P1.3).
    auth_google_oauth_max_per_ip: int = 20
    # BFF → API shared secret for trusted client IP. Empty = ignore header.
    auth_bff_shared_secret: str = ''

    # TMDb (P2 metadata). Server-only; never expose to the browser.
    # Empty = fixture seed / image CDN only; live ``--source tmdb`` requires a key.
    tmdb_api_key: str = ''

    # Search (P2.3). CacheBackend counters; Redis-backed in P2.4.
    search_rate_limit_window_seconds: int = 60
    search_rate_limit_max_per_ip: int = 60

    # Metadata resolve (on-click ingest). CacheBackend counters; Redis when available.
    # IP subject comes from resolve_client_ip (trusted X-Aperture-Client-IP when
    # BFF secret matches; otherwise peer / fallback — not raw X-Forwarded-For).
    metadata_resolve_rate_limit_window_seconds: int = 60
    metadata_resolve_rate_limit_max_per_ip: int = 120
    # Stricter bucket applied only on catalog miss, before calling TMDb.
    metadata_resolve_ingest_rate_limit_max_per_ip: int = 15

    # Lists writes (P3). CacheBackend counters; Redis-backed when available.
    lists_rate_limit_window_seconds: int = 60
    lists_rate_limit_max_writes: int = 60

    # Public profile + diary reads (pc.1). Shared IP bucket for shell + watch-entries.
    # Higher than search: shelf pages paginate diary (many GETs per navigation).
    users_public_rate_limit_window_seconds: int = 60
    users_public_rate_limit_max_per_ip: int = 120

    # Redis (P2.4). Empty = in-memory CacheBackend (tests / local without Redis).
    redis_url: str = ''
    # Metadata detail cache TTL (seconds).
    metadata_cache_ttl_seconds: int = 600
    # Landing poster mosaic (TMDb top-rated). Long TTL — list changes slowly.
    landing_posters_cache_ttl_seconds: int = 60 * 60 * 24
    landing_posters_count: int = Field(default=200, ge=1, le=300)
    # Short TTL when TMDb fails / returns empty so we do not stampede forever.
    landing_posters_negative_cache_ttl_seconds: int = 60
    landing_posters_rate_limit_window_seconds: int = 60
    landing_posters_rate_limit_max_per_ip: int = 60

    # Signed-in home “Top movies” rail (TMDb top_rated pool, shuffled on serve).
    top_movies_cache_ttl_seconds: int = 60 * 60 * 24
    top_movies_pool_count: int = Field(default=100, ge=1, le=100)
    top_movies_default_limit: int = Field(default=12, ge=1, le=100)
    top_movies_negative_cache_ttl_seconds: int = 60
    top_movies_rate_limit_window_seconds: int = 60
    top_movies_rate_limit_max_per_ip: int = 60

    @model_validator(mode='after')
    def validate_production_secrets(self) -> Self:
        """Require strong JWT + BFF secrets when ENVIRONMENT is production."""
        if self.environment != 'production':
            return self
        secret = self.jwt_secret
        if len(secret) < 32:
            raise ValueError(
                'JWT_SECRET must be at least 32 characters when ENVIRONMENT=production'
            )
        if secret.lower() in _JWT_SECRET_PLACEHOLDERS:
            raise ValueError(
                'JWT_SECRET must not be a known placeholder when ENVIRONMENT=production'
            )
        if 'change-me' in secret.lower():
            raise ValueError(
                'JWT_SECRET must not contain change-me when ENVIRONMENT=production'
            )
        bff = self.auth_bff_shared_secret
        if len(bff) < 32:
            raise ValueError(
                'AUTH_BFF_SHARED_SECRET must be at least 32 characters '
                'when ENVIRONMENT=production'
            )
        if bff.lower() in _BFF_SECRET_PLACEHOLDERS or 'change-me' in bff.lower():
            raise ValueError(
                'AUTH_BFF_SHARED_SECRET must not be a known placeholder '
                'when ENVIRONMENT=production'
            )
        return self

    def cors_origin_list(self) -> list[str]:
        """Parse ``cors_origins`` into a list of allowed origins.

        Rejects ``*`` and non-http(s) values so misconfiguration fails loudly.
        """
        if not self.cors_origins.strip():
            return []
        origins: list[str] = []
        for raw in self.cors_origins.split(','):
            origin = raw.strip()
            if not origin:
                continue
            if origin == '*':
                raise ValueError(
                    'CORS_ORIGINS must not be *; list explicit http(s) origins'
                )
            if not (origin.startswith('http://') or origin.startswith('https://')):
                raise ValueError(
                    f'CORS_ORIGINS entry must be an http(s) URL, got: {origin!r}'
                )
            origins.append(origin)
        return origins


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
