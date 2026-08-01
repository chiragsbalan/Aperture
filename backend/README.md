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

## Docker image

```bash
# from repo root
make docker-build
# or:
docker build -f backend/docker/Dockerfile -t aperture-api:local backend
```

Formatting/lint uses **Ruff** (lint + format) rather than Black; see root README.
