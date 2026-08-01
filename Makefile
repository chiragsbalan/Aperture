.PHONY: help lint typecheck test test-integration up down logs migrate dev-api dev-web install

help:
	@echo "Aperture targets:"
	@echo "  make install           - sync backend (uv) and frontend (pnpm) deps"
	@echo "  make lint              - lint backend + frontend"
	@echo "  make typecheck         - mypy + tsc"
	@echo "  make test              - unit tests (no Postgres required)"
	@echo "  make test-integration  - readiness vs Postgres (docker compose up -d db)"
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
	cd backend && uv run ruff check app tests
	cd backend && uv run ruff format --check app tests
	cd frontend && pnpm lint

typecheck:
	cd backend && uv run mypy app
	cd frontend && pnpm exec tsc --noEmit

test:
	cd backend && uv run pytest -m 'not integration'

test-integration:
	cd backend && uv run pytest -m integration

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
