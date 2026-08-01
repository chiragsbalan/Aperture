"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Fail fast on invalid types."""

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )

    app_name: str = 'Aperture'
    app_version: str = '0.1.0'
    environment: str = 'local'
    api_v1_prefix: str = '/api/v1'
    log_level: str = 'INFO'


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
