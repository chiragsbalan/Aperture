"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_REPO_ROOT = _BACKEND_DIR.parent


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

    def cors_origin_list(self) -> list[str]:
        """Parse ``cors_origins`` into a list of allowed origins."""
        if not self.cors_origins.strip():
            return []
        return [
            origin.strip() for origin in self.cors_origins.split(',') if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
