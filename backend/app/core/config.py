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

    # Cloudflare R2 avatar storage (ADR-0014). Empty = upload endpoints return 503.
    r2_account_id: str = ''
    r2_access_key_id: str = ''
    r2_secret_access_key: str = ''
    r2_bucket: str = ''
    # Public CDN base, e.g. https://media.example.com (no trailing slash required).
    r2_public_base_url: str = ''
    r2_upload_url_ttl_seconds: int = Field(default=120, ge=30, le=900)
    avatar_max_bytes: int = Field(default=2 * 1024 * 1024, ge=1024, le=10 * 1024 * 1024)
    # Per-identity cap for avatar upload-url / confirm / delete (shared bucket).
    avatar_rate_limit_window_seconds: int = Field(default=60, ge=10, le=3600)
    avatar_rate_limit_max_writes: int = Field(default=20, ge=1, le=120)

    # Redis (P2.4). Empty = in-memory CacheBackend (tests / local without Redis).
    redis_url: str = ''
    # Switch from TMDB fallback to Aperture community average when a title
    # has at least this many distinct user ratings (latest diary rating / user).
    aperture_rating_switch_threshold: int = Field(default=100, ge=1, le=100_000)
    # Metadata detail cache TTL (seconds) — assembled MovieDetail / TvDetail.
    metadata_cache_ttl_seconds: int = 600
    # Enrichment section cache (providers / similar / meta tabs). Longer than
    # the full DTO so TMDb is not re-hit on every detail miss.
    metadata_enrichment_cache_ttl_seconds: int = 60 * 60 * 6
    # Short TTL when TMDb enrichment fails so we do not stampede forever.
    metadata_enrichment_negative_cache_ttl_seconds: int = 60
    # Lazy stub refresh for TMDb ≤6‑month ToS (days since refreshed_at).
    metadata_stub_max_age_days: int = Field(default=150, ge=1, le=180)
    # Landing poster mosaic (TMDb top-rated). Long TTL — list changes slowly.
    landing_posters_cache_ttl_seconds: int = 60 * 60 * 24
    landing_posters_count: int = Field(default=200, ge=1, le=300)
    # Short TTL when TMDb fails / returns empty so we do not stampede forever.
    landing_posters_negative_cache_ttl_seconds: int = 60
    landing_posters_rate_limit_window_seconds: int = 60
    landing_posters_rate_limit_max_per_ip: int = 60

    # Home rails (TMDb pools; top movies/TV shuffle on serve). Used by signed-in
    # `/` and guest `/` (public home). Per-IP RL is shared across top-movies /
    # top-tv / now-in-theatres (each home load charges 3). Keep headroom for
    # refresh, not scrapers.
    top_movies_cache_ttl_seconds: int = 60 * 60 * 24
    # Cached TMDb top-rated pool for movies + TV browse shelves (auth can take
    # up to ``top_movies_max_auth_limit`` from this pool).
    top_movies_pool_count: int = Field(default=500, ge=1, le=500)
    top_movies_default_limit: int = Field(default=12, ge=1, le=100)
    # Hard cap on anonymous / home-rail ``limit`` returned to clients.
    top_movies_max_public_limit: int = Field(default=24, ge=1, le=100)
    # Hard cap when a valid Bearer access token is present (browse shelves).
    top_movies_max_auth_limit: int = Field(default=500, ge=1, le=500)
    top_movies_negative_cache_ttl_seconds: int = 60
    top_movies_rate_limit_window_seconds: int = 60
    top_movies_rate_limit_max_per_ip: int = 30
    # Now in theatres refreshes more often than all-time top lists.
    now_in_theatres_cache_ttl_seconds: int = 60 * 60 * 6
    now_in_theatres_pool_count: int = Field(default=100, ge=1, le=500)

    @model_validator(mode='after')
    def validate_top_movies_public_limit(self) -> Self:
        """Keep rail display limits coherent with the cached pool size."""
        if self.top_movies_default_limit > self.top_movies_max_public_limit:
            raise ValueError(
                'top_movies_default_limit must be <= top_movies_max_public_limit'
            )
        if self.top_movies_max_public_limit > self.top_movies_max_auth_limit:
            raise ValueError(
                'top_movies_max_public_limit must be <= top_movies_max_auth_limit'
            )
        if self.top_movies_max_auth_limit > self.top_movies_pool_count:
            raise ValueError(
                'top_movies_max_auth_limit must be <= top_movies_pool_count'
            )
        return self

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
