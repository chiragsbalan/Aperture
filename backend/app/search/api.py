"""Public search routes under ``/api/v1``."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.cache import get_cache
from app.core.deps import DbSessionDep, SettingsDep
from app.core.trusted_client import resolve_client_ip
from app.search import service as search_service
from app.search.query import SearchQueryError
from app.search.rate_limit import enforce_search_rate_limit
from app.search.schemas import SearchResponse

router = APIRouter(tags=['search'])


@router.get('/search', response_model=SearchResponse)
async def search_catalog(
    request: Request,
    session: DbSessionDep,
    settings: SettingsDep,
    q: str | None = Query(default=None),
    types: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
) -> SearchResponse:
    """Full-text search across movies, TV shows, and people (seed catalog)."""
    await enforce_search_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        return await search_service.search(
            session,
            q=q,
            types=types,
            page=page,
            limit=limit,
        )
    except SearchQueryError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
