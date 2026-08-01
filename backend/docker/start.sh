#!/bin/sh
# Render / production entrypoint: migrate then serve.
# Runs on every container start (including Render Free cold wakes).
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

echo "Running Alembic migrations..."
attempts=0
max_attempts=5
until alembic upgrade head; do
  attempts=$((attempts + 1))
  if [ "${attempts}" -ge "${max_attempts}" ]; then
    echo "Alembic migrate failed after ${max_attempts} attempts" >&2
    exit 1
  fi
  echo "Migrate failed; retrying in 3s (${attempts}/${max_attempts})..."
  sleep 3
done

PORT="${PORT:-8000}"
echo "Starting uvicorn on 0.0.0.0:${PORT}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
