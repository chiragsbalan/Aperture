"""CLI safety guards for metadata ops."""

from __future__ import annotations

import pytest
from app.metadata.cli import main


def test_refresh_stale_rejects_out_of_range_limit(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv(
        'DATABASE_URL',
        'postgresql+asyncpg://aperture:aperture@127.0.0.1:5432/aperture',
    )
    get_settings.cache_clear()
    with pytest.raises(SystemExit) as exc:
        main(['refresh-stale', '--limit', '0'])
    assert exc.value.code == 2
    err = capsys.readouterr().err
    assert '--limit' in err
    get_settings.cache_clear()


def test_refresh_changes_rejects_out_of_range_days(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv(
        'DATABASE_URL',
        'postgresql+asyncpg://aperture:aperture@127.0.0.1:5432/aperture',
    )
    get_settings.cache_clear()
    with pytest.raises(SystemExit) as exc:
        main(['refresh-changes', '--days', '30'])
    assert exc.value.code == 2
    err = capsys.readouterr().err
    assert '--days' in err
    get_settings.cache_clear()


def test_cli_refuses_non_local_database_url(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv(
        'DATABASE_URL',
        'postgresql+asyncpg://u:p@db.example.supabase.co:5432/postgres',
    )
    get_settings.cache_clear()
    code = main(['refresh-stale', '--limit', '1', '--dry-run'])
    assert code == 2
    err = capsys.readouterr().err
    assert 'non-local' in err.lower()
    get_settings.cache_clear()