"""Unit tests for the Alembic single-head CI gate."""

from __future__ import annotations

import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
from scripts.check_alembic_heads import check_alembic_heads, has_revisions


def _seed_configured_backend(tmp_path: Path) -> None:
    (tmp_path / 'alembic.ini').write_text('[alembic]\nscript_location = migrations\n')
    versions = tmp_path / 'migrations' / 'versions'
    versions.mkdir(parents=True)
    (versions / '0001_rev.py').write_text('# revision placeholder\n')


def _install_fake_alembic(
    monkeypatch: pytest.MonkeyPatch,
    *,
    heads: list[str] | None = None,
    raise_import_error: bool = False,
) -> None:
    if raise_import_error:
        import builtins

        real_import = builtins.__import__

        def _fake_import(name: str, *args: Any, **kwargs: Any) -> Any:
            if name == 'alembic' or name.startswith('alembic.'):
                raise ImportError('alembic missing')
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, '__import__', _fake_import)
        return

    class FakeConfig:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

    class FakeScript:
        @classmethod
        def from_config(cls, _config: object) -> FakeScript:
            return cls()

        def get_heads(self) -> list[str]:
            return list(heads or [])

    alembic_mod = ModuleType('alembic')
    config_mod = ModuleType('alembic.config')
    script_mod = ModuleType('alembic.script')
    config_mod.Config = FakeConfig  # type: ignore[attr-defined]
    script_mod.ScriptDirectory = FakeScript  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, 'alembic', alembic_mod)
    monkeypatch.setitem(sys.modules, 'alembic.config', config_mod)
    monkeypatch.setitem(sys.modules, 'alembic.script', script_mod)


def test_has_revisions_false_when_missing(tmp_path: Path) -> None:
    assert has_revisions(tmp_path / 'missing') is False


def test_has_revisions_ignores_init_only(tmp_path: Path) -> None:
    versions = tmp_path / 'versions'
    versions.mkdir()
    (versions / '__init__.py').write_text('')
    assert has_revisions(versions) is False


def test_skip_when_alembic_not_configured(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = check_alembic_heads(tmp_path)
    assert code == 0
    assert 'skipped' in capsys.readouterr().out


def test_skip_when_ini_without_revisions(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / 'alembic.ini').write_text('[alembic]\n')
    (tmp_path / 'migrations' / 'versions').mkdir(parents=True)
    code = check_alembic_heads(tmp_path)
    assert code == 0
    assert 'skipped' in capsys.readouterr().out


def test_fail_when_alembic_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _seed_configured_backend(tmp_path)
    _install_fake_alembic(monkeypatch, raise_import_error=True)
    code = check_alembic_heads(tmp_path)
    assert code == 1
    assert 'not installed' in capsys.readouterr().err


def test_fail_when_multiple_heads(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _seed_configured_backend(tmp_path)
    _install_fake_alembic(monkeypatch, heads=['aaaa', 'bbbb'])
    code = check_alembic_heads(tmp_path)
    assert code == 1
    assert 'exactly one Alembic head' in capsys.readouterr().err


def test_ok_when_single_head(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _seed_configured_backend(tmp_path)
    _install_fake_alembic(monkeypatch, heads=['deadbeef'])
    code = check_alembic_heads(tmp_path)
    assert code == 0
    assert 'deadbeef' in capsys.readouterr().out
