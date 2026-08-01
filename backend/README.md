# Aperture backend

FastAPI modular monolith.

## Compose (preferred)

From the repo root:

```bash
make up
curl -s http://localhost:8000/health/ready
```

## Local API process + Compose Postgres

```bash
# repo root
cp .env.example .env   # provides DATABASE_URL for localhost
docker compose up -d db
make dev-api
```

Settings loads the repo-root `.env` (and optional `backend/.env` overrides).

## Ops routes (outside `/api/v1`)

| Path | Meaning |
|---|---|
| `GET /health/live` | Process up |
| `GET /health/ready` | Postgres reachable |
| `GET /version` | App metadata |

## Schema / migrations (P0.4)

ORM conventions live in `app/core/` (`base.py`, `mixins.py`, `ids.py`). See [ADR-0002](../docs/decisions/ADR-0002-orm-schema.md).

```bash
# repo root — applies Alembic revisions to DATABASE_URL
make migrate

# or from backend/
uv run alembic upgrade head
uv run alembic downgrade base
```

Production (Render) runs migrations on container start via `docker/start.sh` before uvicorn.

## Metadata catalog (P2.1 / P2.2)

Canonical movies / TV / people live in Postgres (ADR-0004). Public detail APIs:

| Path | Meaning |
|---|---|
| `GET /api/v1/movies/{id}` | Movie detail (Cache-Control: public, max-age=300) |
| `GET /api/v1/tv/{id}` | TV-show detail |
| `GET /api/v1/people/{id}` | Person detail |

Seed from offline fixtures (no TMDb key):

```bash
make migrate
make seed-metadata   # python -m app.metadata.cli seed --source fixtures
```

The CLI prints sample UUIDs for `/movies/{id}`, `/tv/{id}`, and `/people/{id}` on the frontend. Re-running seed is idempotent via `external_ids`.

Live TMDb seed (`--source tmdb`) requires `TMDB_API_KEY` in the environment and fails clearly when empty. For production, run fixture seed against the prod `DATABASE_URL` as a ship step until a curated live ingest list is wired.

TMDb image CDN URLs are built server-side from relative `poster_path` / `profile_path` values; the API key is never required for images and must never be exposed to the browser.

## Docker image

```bash
# from repo root
make docker-build
# or:
docker build -f backend/docker/Dockerfile -t aperture-api:local backend
```

Formatting/lint uses **Ruff** (lint + format) rather than Black; see root README.
