# Aperture

Monorepo scaffold for the Aperture product (Phase 0 foundation).

## Requirements

- Python **3.12** + [uv](https://docs.astral.sh/uv/)
- Node.js **22+** + [pnpm](https://pnpm.io/) (via Corepack is fine)

Backend formatting uses **Ruff** (lint + format) instead of Black.

## Quick start (P0.1)

```bash
make install
make dev-api    # http://localhost:8000/health/live
make dev-web    # http://localhost:3000
```

Useful checks:

```bash
make lint
make typecheck
make test
```

Optional pre-commit hooks:

```bash
cd backend && uv run pre-commit install --config ../.pre-commit-config.yaml
```

## Layout

```text
backend/     FastAPI (uv)
frontend/    Next.js App Router (pnpm)
docs/        PRD, roadmap, architecture, ADRs
```

## Docs

- [docs/](docs/) — PRD, roadmap, architecture, design, engineering, ADRs
- Local-only (gitignored): `PLAN.md`, `CONTRIBUTING.md`, `phases/` — shipping plan and git workflow notes on this machine
- Hosting decision: [docs/decisions/ADR-0003-hosting-and-bff.md](docs/decisions/ADR-0003-hosting-and-bff.md)
- Phase authority: [docs/decisions/ADR-0001-phase-authority.md](docs/decisions/ADR-0001-phase-authority.md)

## License

[MIT](LICENSE)
