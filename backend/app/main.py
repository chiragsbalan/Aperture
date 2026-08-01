"""FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.core.config import get_settings
from app.core.db import dispose_db, init_db
from app.core.logging import configure_logging


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan hook."""
    settings = get_settings()
    init_db(settings)
    try:
        yield
    finally:
        await dispose_db()


def create_app() -> FastAPI:
    """Build and return the FastAPI application."""
    settings = get_settings()
    configure_logging(settings)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )

    cors_origins = settings.cors_origin_list()
    if cors_origins:
        # Opt-in only. Default is no browser CORS — use the Next.js BFF.
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=False,
            allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allow_headers=['Authorization', 'Content-Type'],
        )

    app.include_router(health_router)

    # Public API surface reserved for later phases (empty in P0).
    api_v1 = APIRouter(prefix=settings.api_v1_prefix)
    app.include_router(api_v1)

    return app


app = create_app()
