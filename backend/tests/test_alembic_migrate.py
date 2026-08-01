"""Integration tests for Alembic migrations against Postgres."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.mark.integration
def test_alembic_upgrade_head_and_downgrade_base() -> None:
    """Empty baseline must upgrade and downgrade cleanly on real Postgres."""
    from app.core.config import get_settings

    get_settings.cache_clear()

    config = Config(str(BACKEND_DIR / 'alembic.ini'))
    script = ScriptDirectory.from_config(config)
    heads = script.get_heads()
    assert len(heads) == 1

    command.upgrade(config, 'head')
    command.downgrade(config, 'base')
    command.upgrade(config, 'head')
