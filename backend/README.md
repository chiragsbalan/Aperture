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

Formatting/lint uses **Ruff** (lint + format) rather than Black; see root README.
