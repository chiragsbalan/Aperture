"""CLI entrypoints for metadata seed / ops.

Usage (from ``backend/``)::

    uv run python -m app.metadata.cli seed --source fixtures
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from app.core.config import get_settings
from app.core.db import dispose_db, init_db, session_scope
from app.metadata import repository as metadata_repository
from app.metadata.ingest import seed_from_fixtures
from app.metadata.tmdb.client import TmdbClient, TmdbConfigError


async def _seed_fixtures() -> int:
    settings = get_settings()
    init_db(settings)
    try:
        async with session_scope() as session:
            counts = await seed_from_fixtures(session)
            samples = await metadata_repository.list_sample_content_ids(session)
        print(
            f'Seeded fixtures: {counts["movies"]} movies, '
            f'{counts["tv_shows"]} TV shows, {counts["people"]} people '
            f'(idempotent upsert).'
        )
        print('Sample UUIDs (open these on the frontend):')
        for kind, entity_id, title in samples:
            if kind == 'movie':
                path = f'/movies/{entity_id}'
            elif kind == 'tv':
                path = f'/tv/{entity_id}'
            else:
                path = f'/people/{entity_id}'
            print(f'  [{kind}] {entity_id}  {title}  →  {path}')
        return 0
    finally:
        await dispose_db()


async def _seed_tmdb() -> int:
    settings = get_settings()
    try:
        TmdbClient.from_settings(settings)
    except TmdbConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(
        'Live TMDb seed is not wired for a curated id list in this slice. '
        'Use --source fixtures (no API key), or add a curated TMDb id list later.',
        file=sys.stderr,
    )
    return 2


def main(argv: list[str] | None = None) -> int:
    """Parse CLI args and run the requested command."""
    parser = argparse.ArgumentParser(prog='python -m app.metadata.cli')
    sub = parser.add_subparsers(dest='command', required=True)

    seed_parser = sub.add_parser('seed', help='Seed the canonical catalog')
    seed_parser.add_argument(
        '--source',
        choices=('fixtures', 'tmdb'),
        default='fixtures',
        help='fixtures = offline JSON (default); tmdb = live API (needs key)',
    )

    args = parser.parse_args(argv)
    if args.command == 'seed':
        if args.source == 'fixtures':
            return asyncio.run(_seed_fixtures())
        return asyncio.run(_seed_tmdb())
    parser.error(f'unknown command: {args.command}')
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
