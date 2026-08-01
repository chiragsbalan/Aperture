.PHONY: help install lint typecheck import-lint alembic-heads test test-integration frontend-build docker-build ci up down logs migrate dev-api dev-web

help:
	@echo "Aperture targets:"
	@echo "  make install           - sync backend (uv) and frontend (pnpm) deps"
	@echo "  make lint              - lint backend + frontend"
	@echo "  make typecheck         - mypy + tsc"
	@echo "  make import-lint       - import-linter contracts"
	@echo "  make alembic-heads     - single Alembic head gate (stub until P0.4)"
	@echo "  make test              - unit tests (no Postgres required)"
	@echo "  make test-integration  - readiness vs Postgres (docker compose up -d db)"
	@echo "  make frontend-build    - Next.js production build"
	@echo "  make docker-build      - build backend Docker image"
	@echo "  make ci                - full local parity with GitHub CI jobs"
	@echo "  make up                - docker compose up --build -d"
	@echo "  make down              - docker compose down"
	@echo "  make logs              - docker compose logs -f"
	@echo "  make migrate           - alembic upgrade (P0.4+)"
	@echo "  make dev-api           - FastAPI on host (needs DATABASE_URL / Compose db)"
	@echo "  make dev-web           - run Next.js locally"

install:
	cd backend && uv sync --all-extras
	cd frontend && pnpm install

lint:
	cd backend && uv run ruff check app tests scripts
	cd backend && uv run ruff format --check app tests scripts
	cd frontend && pnpm lint
	cd frontend && pnpm format:check

typecheck:
	cd backend && uv run mypy app
	cd frontend && pnpm exec tsc --noEmit

import-lint:
	cd backend && uv run lint-imports

alembic-heads:
	cd backend && uv run python scripts/check_alembic_heads.py

test:
	cd backend && uv run pytest -m 'not integration'

test-integration:
	cd backend && uv run pytest -m integration

frontend-build:
	cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8000 pnpm build

docker-build:
	docker build -f backend/docker/Dockerfile -t aperture-api:local backend

# Mirrors required GitHub checks: Backend + Frontend + Docker (integration needs Postgres).
ci: lint typecheck import-lint alembic-heads test test-integration frontend-build docker-build

dev-api:
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-web:
	cd frontend && pnpm dev

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

migrate:
	@echo "P0.4: alembic migrate not wired yet"
