"""CLI entrypoints for metadata seed / ops.

Usage (from ``backend/``)::

    uv run python -m app.metadata.cli seed --source fixtures
    uv run python -m app.metadata.cli refresh-stale --limit 50
    uv run python -m app.metadata.cli refresh-changes --days 1
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from app.core.config import get_settings
from app.core.db import dispose_db, init_db, session_scope
from app.core.db_ssl import is_local_database_url
from app.metadata import repository as metadata_repository
from app.metadata.ingest import seed_from_fixtures
from app.metadata.stub_refresh import (
    count_stale_stubs,
    refresh_from_tmdb_changes,
    refresh_stale_stubs_batch,
)
from app.metadata.tmdb.client import TmdbClient, TmdbConfigError


def _refuse_non_local_db(*, allow_non_local: bool) -> int | None:
    """Return exit code 2 when DATABASE_URL is not local and not opted in."""
    settings = get_settings()
    if allow_non_local or is_local_database_url(settings.database_url):
        return None
    print(
        'Refusing to run against non-local DATABASE_URL host. '
        'Use a loopback/Compose URL, or pass --allow-non-local-db explicitly.',
        file=sys.stderr,
    )
    return 2


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


async def _refresh_stale(limit: int, *, dry_run: bool) -> int:
    settings = get_settings()
    init_db(settings)
    try:
        if dry_run:
            async with session_scope() as session:
                would = await count_stale_stubs(
                    session,
                    settings=settings,
                    limit=limit,
                )
            print(f'Stale stub refresh dry-run: would_refresh={would} (limit={limit})')
            return 0
        async with session_scope() as session:
            counts = await refresh_stale_stubs_batch(
                session,
                settings=settings,
                limit=limit,
            )
        print(
            f'Stale stub refresh: refreshed={counts["refreshed"]} '
            f'failed={counts["failed"]} skipped={counts["skipped"]}'
        )
        return 0
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    finally:
        await dispose_db()


async def _refresh_changes(days: int, *, dry_run: bool) -> int:
    settings = get_settings()
    init_db(settings)
    try:
        async with session_scope() as session:
            counts = await refresh_from_tmdb_changes(
                session,
                settings=settings,
                lookback_days=days,
                dry_run=dry_run,
            )
        if dry_run:
            print(
                f'TMDb changes refresh dry-run (lookback={days}d): '
                f'movie_changes={counts["movie_changes"]} '
                f'tv_changes={counts["tv_changes"]} '
                f'would_refresh={counts["would_refresh"]} '
                f'unknown={counts["unknown"]}'
            )
            return 0
        print(
            f'TMDb changes refresh (lookback={days}d): '
            f'movie_changes={counts["movie_changes"]} '
            f'tv_changes={counts["tv_changes"]} '
            f'refreshed={counts["refreshed"]} '
            f'failed={counts["failed"]} '
            f'unknown={counts["unknown"]}'
        )
        return 0
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    finally:
        await dispose_db()


def _add_db_safety_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        '--allow-non-local-db',
        action='store_true',
        help='Allow DATABASE_URL hosts outside localhost/127.0.0.1/::1/db',
    )


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
    _add_db_safety_flags(seed_parser)

    stale_parser = sub.add_parser(
        'refresh-stale',
        help='Refresh lean stubs older than metadata_stub_max_age_days',
    )
    stale_parser.add_argument(
        '--limit',
        type=int,
        default=50,
        help='Max titles to refresh (default 50; capped 1..500)',
    )
    stale_parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Count would-refresh rows without TMDb writes',
    )
    _add_db_safety_flags(stale_parser)

    changes_parser = sub.add_parser(
        'refresh-changes',
        help='Refresh stubs for ids listed in TMDb /movie|/tv/changes',
    )
    changes_parser.add_argument(
        '--days',
        type=int,
        default=1,
        help='Lookback window in days (default 1; capped 1..14)',
    )
    changes_parser.add_argument(
        '--dry-run',
        action='store_true',
        help='List change counts / known mappings without stub writes',
    )
    _add_db_safety_flags(changes_parser)

    args = parser.parse_args(argv)

    if args.command in ('seed', 'refresh-stale', 'refresh-changes'):
        refused = _refuse_non_local_db(
            allow_non_local=bool(getattr(args, 'allow_non_local_db', False)),
        )
        if refused is not None:
            return refused

    if args.command == 'seed':
        if args.source == 'fixtures':
            return asyncio.run(_seed_fixtures())
        return asyncio.run(_seed_tmdb())
    if args.command == 'refresh-stale':
        if args.limit < 1 or args.limit > 500:
            parser.error('--limit must be between 1 and 500')
        return asyncio.run(_refresh_stale(args.limit, dry_run=args.dry_run))
    if args.command == 'refresh-changes':
        if args.days < 1 or args.days > 14:
            parser.error('--days must be between 1 and 14')
        return asyncio.run(_refresh_changes(args.days, dry_run=args.dry_run))
    parser.error(f'unknown command: {args.command}')
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
