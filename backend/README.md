# Aperture backend

FastAPI modular monolith. Local run (P0.1):

```bash
uv sync --all-extras
uv run uvicorn app.main:app --reload --port 8000
```

Or from repo root: `make dev-api`.

Formatting/lint uses **Ruff** (lint + format) rather than Black; see root README.
