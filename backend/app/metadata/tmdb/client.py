"""Minimal TMDb HTTP client (optional live seed; requires API key)."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from app.core.config import Settings
from app.metadata.enrichment import build_extras_from_tmdb_payload
from app.metadata.tmdb.dto import TmdbMovie, TmdbPerson, TmdbTvShow

TMDB_API_BASE = 'https://api.themoviedb.org/3'
# TMDb guidance is ~40–50 req/s for many plans; stay well under for seed jobs.
_DEFAULT_MIN_INTERVAL_SECONDS = 0.25

_MOVIE_INGEST_APPEND = (
    'credits,keywords,images,videos,watch/providers,'
    'recommendations,release_dates,alternative_titles'
)
_TV_INGEST_APPEND = (
    'credits,keywords,images,videos,watch/providers,'
    'recommendations,content_ratings,alternative_titles'
)


class TmdbConfigError(RuntimeError):
    """TMDb is not configured (missing API key)."""


class TmdbNotFoundError(LookupError):
    """TMDb returned 404 for the requested resource."""


class TmdbUnavailableError(RuntimeError):
    """TMDb upstream failed (429 / 5xx / timeout / transport error)."""


class TmdbClient:
    """Thin async wrapper around TMDb v3 endpoints used by seed / resolve.

    The API key is never logged or included in ``repr`` / ``str``.
    """

    def __init__(
        self,
        api_key: str,
        *,
        timeout: float = 30.0,
        min_interval_seconds: float = _DEFAULT_MIN_INTERVAL_SECONDS,
    ) -> None:
        if not api_key.strip():
            raise TmdbConfigError(
                'TMDB_API_KEY is empty. Set it in the environment, or seed '
                'with --source fixtures (no key required).'
            )
        self._api_key = api_key.strip()
        self._timeout = timeout
        self._min_interval = max(0.0, min_interval_seconds)
        self._lock = asyncio.Lock()
        self._last_request_at = 0.0

    def __repr__(self) -> str:
        return f'TmdbClient(base={TMDB_API_BASE!r}, api_key=***)'

    @classmethod
    def from_settings(cls, settings: Settings) -> TmdbClient:
        """Build a client from application settings."""
        return cls(settings.tmdb_api_key)

    async def get_movie(self, tmdb_id: int) -> TmdbMovie:
        """Fetch movie detail + credits."""
        data = await self._get(
            f'/movie/{tmdb_id}',
            {'append_to_response': 'credits'},
        )
        return TmdbMovie.model_validate(data)

    async def get_movie_for_ingest(self, tmdb_id: int) -> TmdbMovie:
        """Fetch movie detail with enrichment fields for catalog upsert."""
        data = await self._get(
            f'/movie/{tmdb_id}',
            {'append_to_response': _MOVIE_INGEST_APPEND},
        )
        movie = TmdbMovie.model_validate(data)
        movie.extras = build_extras_from_tmdb_payload(data, kind='movie')
        return movie

    async def get_tv(self, tmdb_id: int) -> TmdbTvShow:
        """Fetch TV detail + credits + seasons summary."""
        data = await self._get(
            f'/tv/{tmdb_id}',
            {'append_to_response': 'credits'},
        )
        return TmdbTvShow.model_validate(data)

    async def get_tv_for_ingest(self, tmdb_id: int) -> TmdbTvShow:
        """Fetch TV detail with enrichment fields for catalog upsert."""
        data = await self._get(
            f'/tv/{tmdb_id}',
            {'append_to_response': _TV_INGEST_APPEND},
        )
        show = TmdbTvShow.model_validate(data)
        show.extras = build_extras_from_tmdb_payload(data, kind='tv')
        return show

    async def get_person(self, tmdb_id: int) -> TmdbPerson:
        """Fetch person detail."""
        data = await self._get(f'/person/{tmdb_id}')
        return TmdbPerson.model_validate(data)

    async def _throttle(self) -> None:
        if self._min_interval <= 0:
            return
        now = time.monotonic()
        wait = self._min_interval - (now - self._last_request_at)
        if wait > 0:
            await asyncio.sleep(wait)

    async def _get(
        self,
        path: str,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        query = dict(params or {})
        async with self._lock:
            await self._throttle()
            async with httpx.AsyncClient(
                base_url=TMDB_API_BASE,
                timeout=self._timeout,
                # Never attach default auth headers that might be logged elsewhere.
            ) as client:
                # Pass api_key only as a request param; do not log query strings.
                try:
                    response = await client.get(
                        path,
                        params={**query, 'api_key': self._api_key},
                    )
                except httpx.TimeoutException as exc:
                    raise TmdbUnavailableError('TMDb request timed out') from exc
                except httpx.HTTPError as exc:
                    raise TmdbUnavailableError('TMDb request failed') from exc
                self._last_request_at = time.monotonic()
                if response.status_code == 404:
                    raise TmdbNotFoundError(f'TMDb resource not found: {path}')
                if response.status_code == 429 or response.status_code >= 500:
                    raise TmdbUnavailableError(
                        f'TMDb unavailable: HTTP {response.status_code}'
                    )
                try:
                    response.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    raise TmdbUnavailableError(
                        f'TMDb unavailable: HTTP {response.status_code}'
                    ) from exc
                payload = response.json()
                if not isinstance(payload, dict):
                    raise RuntimeError('unexpected TMDb response shape')
                return payload
