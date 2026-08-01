"""Unit tests for asyncpg SSL connect_args selection."""

from app.core.db_ssl import asyncpg_connect_args


def test_local_hosts_skip_ssl() -> None:
    assert (
        asyncpg_connect_args(
            'postgresql+asyncpg://aperture:aperture@localhost:5432/aperture'
        )
        == {}
    )
    assert (
        asyncpg_connect_args(
            'postgresql+asyncpg://aperture:aperture@127.0.0.1:5432/aperture'
        )
        == {}
    )
    assert (
        asyncpg_connect_args('postgresql+asyncpg://aperture:aperture@db:5432/aperture')
        == {}
    )


def test_remote_hosts_require_ssl() -> None:
    assert asyncpg_connect_args(
        'postgresql+asyncpg://postgres.ref:pw@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'
    ) == {'ssl': True}
