#!/usr/bin/env python3
"""Fail CI when Alembic has multiple heads.

Until P0.4 wires Alembic, this exits 0 (skipped). Once ``alembic.ini`` and at
least one revision exist, exactly one head is required.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_DIR / 'alembic.ini'
VERSIONS_DIR = BACKEND_DIR / 'migrations' / 'versions'


def _has_revisions() -> bool:
    if not VERSIONS_DIR.is_dir():
        return False
    return any(
        path.is_file() and path.name != '__init__.py' and path.suffix == '.py'
        for path in VERSIONS_DIR.iterdir()
    )


def main() -> int:
    """Return 0 when a single head exists or Alembic is not configured yet."""
    if not ALEMBIC_INI.is_file() or not _has_revisions():
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

    config = Config(str(ALEMBIC_INI))
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


if __name__ == '__main__':
    raise SystemExit(main())
