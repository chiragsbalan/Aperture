.PHONY: help lint typecheck test up down logs migrate dev-api dev-web install

help:
	@echo "Aperture targets:"
	@echo "  make install     - sync backend (uv) and frontend (pnpm) deps"
	@echo "  make lint        - lint backend + frontend"
	@echo "  make typecheck   - mypy + tsc"
	@echo "  make test        - run tests (P0.1: backend smoke only)"
	@echo "  make dev-api     - run FastAPI locally (no Docker)"
	@echo "  make dev-web     - run Next.js locally (no Docker)"
	@echo "  make up          - docker compose up (P0.2+)"
	@echo "  make down        - docker compose down (P0.2+)"
	@echo "  make logs        - docker compose logs (P0.2+)"
	@echo "  make migrate     - alembic upgrade (P0.4+)"

install:
	cd backend && uv sync --all-extras
	cd frontend && pnpm install

lint:
	cd backend && uv run ruff check app tests
	cd backend && uv run ruff format --check app tests
	cd frontend && pnpm lint

typecheck:
	cd backend && uv run mypy app
	cd frontend && pnpm exec tsc --noEmit

test:
	cd backend && uv run pytest

dev-api:
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-web:
	cd frontend && pnpm dev

up:
	@echo "P0.2: docker compose up not wired yet"

down:
	@echo "P0.2: docker compose down not wired yet"

logs:
	@echo "P0.2: docker compose logs not wired yet"

migrate:
	@echo "P0.4: alembic migrate not wired yet"
