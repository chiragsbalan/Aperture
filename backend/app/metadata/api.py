"""Public metadata detail routes under ``/api/v1``."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Response, status

from app.core.deps import DbSessionDep
from app.metadata import service as metadata_service
from app.metadata.schemas import MovieDetail, PersonDetail, TvDetail

router = APIRouter(tags=['metadata'])

_CACHE_CONTROL = 'public, max-age=300'


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


@router.get('/movies/{content_id}', response_model=MovieDetail)
async def get_movie(
    content_id: uuid.UUID,
    session: DbSessionDep,
    response: Response,
) -> MovieDetail:
    """Return curated movie detail for a canonical content id."""
    response.headers['Cache-Control'] = _CACHE_CONTROL
    try:
        return await metadata_service.get_movie_detail(session, content_id)
    except metadata_service.CatalogNotFoundError as exc:
        raise _not_found('Movie not found') from exc


@router.get('/tv/{content_id}', response_model=TvDetail)
async def get_tv(
    content_id: uuid.UUID,
    session: DbSessionDep,
    response: Response,
) -> TvDetail:
    """Return curated TV-show detail for a canonical content id."""
    response.headers['Cache-Control'] = _CACHE_CONTROL
    try:
        return await metadata_service.get_tv_detail(session, content_id)
    except metadata_service.CatalogNotFoundError as exc:
        raise _not_found('TV show not found') from exc


@router.get('/people/{person_id}', response_model=PersonDetail)
async def get_person(
    person_id: uuid.UUID,
    session: DbSessionDep,
    response: Response,
) -> PersonDetail:
    """Return curated person detail for a canonical person id."""
    response.headers['Cache-Control'] = _CACHE_CONTROL
    try:
        return await metadata_service.get_person_detail(session, person_id)
    except metadata_service.CatalogNotFoundError as exc:
        raise _not_found('Person not found') from exc
