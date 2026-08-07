"""FastAPI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.catalog import router as catalog_router
from app.api.health import router as health_router
from app.api.library import router as library_router
from app.api.lists import router as lists_router
from app.api.users import router as users_router
from app.auth.api import router as auth_router
from app.core.cache import init_cache, shutdown_cache
from app.core.config import get_settings
from app.core.db import dispose_db, init_db
from app.core.logging import configure_logging
from app.metadata.api import router as metadata_router
from app.search.api import router as search_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan hook."""
    settings = get_settings()
    init_db(settings)
    init_cache(settings.redis_url)
    try:
        yield
    finally:
        await shutdown_cache()
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

    api_v1 = APIRouter(prefix=settings.api_v1_prefix)
    api_v1.include_router(auth_router)
    api_v1.include_router(users_router)
    api_v1.include_router(lists_router)
    api_v1.include_router(library_router)
    # Auth-aware catalog rails (top movies/TV) before metadata so path matches
    # stay on the API-layer handlers that may import Auth.
    api_v1.include_router(catalog_router)
    api_v1.include_router(metadata_router)
    api_v1.include_router(search_router)
    app.include_router(api_v1)

    return app


app = create_app()
