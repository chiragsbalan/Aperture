#!/usr/bin/env python3
"""Fail CI when Alembic has multiple heads.

Until P0.4 wires Alembic, this exits 0 (skipped). Once ``alembic.ini`` and at
least one revision exist, exactly one head is required.
"""

from __future__ import annotations

import sys
from pathlib import Path

DEFAULT_BACKEND_DIR = Path(__file__).resolve().parents[1]


def has_revisions(versions_dir: Path) -> bool:
    """Return True when migration revision modules exist under versions_dir."""
    if not versions_dir.is_dir():
        return False
    return any(
        path.is_file() and path.name != '__init__.py' and path.suffix == '.py'
        for path in versions_dir.iterdir()
    )


def check_alembic_heads(backend_dir: Path | None = None) -> int:
    """Return 0 when a single head exists or Alembic is not configured yet."""
    root = backend_dir if backend_dir is not None else DEFAULT_BACKEND_DIR
    alembic_ini = root / 'alembic.ini'
    versions_dir = root / 'migrations' / 'versions'

    if not alembic_ini.is_file() or not has_revisions(versions_dir):
        print(
            'Alembic single-head check: skipped '
            '(not configured yet; expected until P0.4).'
        )
        return 0

    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
    except ImportError:
        print(
            'Alembic is configured but the alembic package is not installed.',
            file=sys.stderr,
        )
        return 1

    config = Config(str(alembic_ini))
    script = ScriptDirectory.from_config(config)
    heads = script.get_heads()
    if len(heads) != 1:
        print(
            f'Expected exactly one Alembic head, found {len(heads)}: {heads}',
            file=sys.stderr,
        )
        return 1

    print(f'Alembic single head OK: {heads[0]}')
    return 0


def main() -> int:
    """CLI entrypoint."""
    return check_alembic_heads()


if __name__ == '__main__':
    raise SystemExit(main())
