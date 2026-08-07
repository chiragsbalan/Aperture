"""Decide asyncpg SSL settings from the database URL host."""

from __future__ import annotations

import ssl

from sqlalchemy.engine.url import make_url

# Local Compose / CI hosts — no TLS.
_LOCAL_HOSTS = frozenset({'localhost', '127.0.0.1', '::1', 'db'})


def is_local_database_url(database_url: str) -> bool:
    """True when the URL host is loopback / Compose ``db`` (or ``*.local``)."""
    host = (make_url(database_url).host or '').lower()
    return host in _LOCAL_HOSTS or host.endswith('.local')


def _supabase_compatible_ssl_context() -> ssl.SSLContext:
    """TLS encrypt without CA verification (Postgres ``sslmode=require``).

    Supabase pooler chains often include an intermediate that fails
    ``ssl=True`` / verify-full checks with asyncpg
    (``CERTIFICATE_VERIFY_FAILED: self-signed certificate in certificate chain``).
    Encryption is still required; hostname/CA verification is not.
    """
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    return context


def asyncpg_connect_args(database_url: str) -> dict[str, object]:
    """Return ``connect_args`` for asyncpg.

    Supabase and other remote Postgres require TLS. Local Compose (``db``) and
    loopback do not. Prefer this over ``?ssl=require`` query params, which are
    unreliable with ``postgresql+asyncpg``.
    """
    if is_local_database_url(database_url):
        return {}
    return {'ssl': _supabase_compatible_ssl_context()}
