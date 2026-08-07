"""Unit tests for asyncpg SSL connect_args selection."""

import ssl

from app.core.db_ssl import asyncpg_connect_args, is_local_database_url


def test_is_local_database_url() -> None:
    assert is_local_database_url(
        'postgresql+asyncpg://aperture:aperture@localhost:5432/aperture'
    )
    assert is_local_database_url(
        'postgresql+asyncpg://aperture:aperture@127.0.0.1:5432/aperture'
    )
    assert is_local_database_url(
        'postgresql+asyncpg://aperture:aperture@[::1]:5432/aperture'
    )
    assert is_local_database_url(
        'postgresql+asyncpg://aperture:aperture@db:5432/aperture'
    )
    assert not is_local_database_url(
        'postgresql+asyncpg://u:p@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'
    )


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


def test_remote_hosts_require_tls_without_cert_verify() -> None:
    args = asyncpg_connect_args(
        'postgresql+asyncpg://postgres.ref:pw@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'
    )
    context = args.get('ssl')
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode is ssl.CERT_NONE
    assert context.check_hostname is False
