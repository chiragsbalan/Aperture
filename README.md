# Aperture

Monorepo for the Aperture product (Phase 0 foundation).

## Requirements

- Docker + Docker Compose (recommended day-to-day path)
- Python **3.12** + [uv](https://docs.astral.sh/uv/) (local non-Docker API)
- Node.js **22+** + [pnpm](https://pnpm.io/) (local non-Docker web)

Backend formatting uses **Ruff** (lint + format) instead of Black.

## Quick start (P0.2 — Compose)

```bash
cp .env.example .env
make up
```

Then:

- Web: http://localhost:3000 (shows API readiness + version)
- API live: http://localhost:8000/health/live
- API ready (Postgres): http://localhost:8000/health/ready
- API version: http://localhost:8000/version

```bash
make logs    # follow Compose logs
make down    # stop stack (volume kept; use docker compose down -v to wipe DB)
```

Postgres is published on `127.0.0.1` only (not LAN-wide).

## Local apps (API/web on host)

Keep Postgres in Compose, run apps on the host:

```bash
cp .env.example .env
make install
docker compose up -d db
make dev-api    # reads repo-root .env; http://localhost:8000/health/ready
make dev-web    # http://localhost:3000
```

Useful checks:

```bash
make lint
make typecheck
make import-lint          # minimal layering contracts (expand when domains land)
make alembic-heads        # single Alembic head (stub until P0.4)
make test                 # unit tests (DB mocked for readiness)
make test-integration     # needs Postgres (e.g. docker compose up -d db)
make frontend-build
make docker-build         # needs Docker
# Full local parity with required GitHub checks (needs Postgres + Docker):
docker compose up -d db && make ci
```

Optional pre-commit hooks:

```bash
cd backend && uv run pre-commit install --config ../.pre-commit-config.yaml
```

Optional Dev Container: open the repo in a VS Code/Cursor Dev Container (`.devcontainer/`), then `make up` for the full stack.

## CI (P0.3)

Every PR and push to `main` runs GitHub Actions (`.github/workflows/ci.yml`):

- **Backend** — Ruff, mypy, import-linter, Alembic single-head gate, unit + integration tests (ephemeral CI Postgres; throwaway creds only)
- **Frontend** — ESLint, Prettier, `tsc`, Next.js build
- **Docker** — backend image build (cache write on push only)

Required check names and branch-protection settings: [`.github/README.md`](.github/README.md). Local mirror: `make ci`.

## Layout

```text
backend/     FastAPI (uv) + Docker image
frontend/    Next.js App Router (pnpm)
docs/        PRD, roadmap, architecture, ADRs
docker-compose.yml
```

## Docs

- [docs/](docs/) — PRD, roadmap, architecture, design, engineering, ADRs
- Local-only (gitignored): `PLAN.md`, `CONTRIBUTING.md`, `phases/` — shipping plan and git workflow notes on this machine
- CI / branch protection: [`.github/README.md`](.github/README.md)
- Hosting decision: [docs/decisions/ADR-0003-hosting-and-bff.md](docs/decisions/ADR-0003-hosting-and-bff.md)
- Phase authority: [docs/decisions/ADR-0001-phase-authority.md](docs/decisions/ADR-0001-phase-authority.md)

## License

[MIT](LICENSE)
