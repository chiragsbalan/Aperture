# Aperture

Monorepo for the Aperture product (Phase 0 foundation).

## Requirements

- Docker + Docker Compose (recommended day-to-day path)
- Python **3.12** + [uv](https://docs.astral.sh/uv/) (local non-Docker API)
- Node.js **22+** + [pnpm](https://pnpm.io/) (local non-Docker web)

Backend formatting uses **Ruff** (lint + format) instead of Black.

## Quick start (Compose)

```bash
cp .env.example .env
make up
```

Then:

- Web: http://localhost:3000 (shell + health via same-origin BFF `/api/proxy/...`)
- BFF examples: http://localhost:3000/api/proxy/health/ready · `/api/proxy/version`
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
make alembic-heads        # single Alembic head gate
make migrate              # alembic upgrade head (needs Postgres)
make test                 # unit tests (DB mocked for readiness)
make test-integration     # needs Postgres (e.g. docker compose up -d db)
make frontend-build
make frontend-a11y        # axe shell scan (Playwright Chromium)
make docker-build         # needs Docker
# Full local parity with required GitHub checks (needs Postgres + Docker):
docker compose up -d db && make ci
```

### Frontend shell (P0.5)

Dark cinematic shell with design tokens (`frontend/src/styles/tokens.css`), Fraunces + Source Sans 3, and a11y baseline. Browser traffic to the API goes through the Next.js BFF at `/api/proxy/*` (reserved cookies `__Host-ap_at` / `__Host-ap_rt` for P1 — not set yet).

## Production (P0.6)

Early hosting ([ADR-0003](docs/decisions/ADR-0003-hosting-and-bff.md)):

| Layer | Provider | URL |
|---|---|---|
| Web + BFF | Vercel | https://aperture-sepia.vercel.app |
| API | Render Free | https://aperture-api-da3c.onrender.com |
| Postgres | Supabase Free | (connection string in Render env only) |

- Merge to `main` auto-deploys FE (Vercel) and BE (Render).
- API container runs `alembic upgrade head` then uvicorn (`backend/docker/start.sh`) on **every** start, including Free-tier cold wakes.
- Render Free may sleep after idle (~1 min wake + migrate). Supabase Free may pause after low activity — restore in the dashboard if readiness fails.
- Blueprint: [`render.yaml`](render.yaml) (aligns with existing `aperture-api`; do not duplicate the service). Release notes: [`docs/releases/v0.1.0.md`](docs/releases/v0.1.0.md).

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
