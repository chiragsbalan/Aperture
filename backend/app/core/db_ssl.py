"""Decide asyncpg SSL settings from the database URL host."""

from __future__ import annotations

from sqlalchemy.engine.url import make_url

# Local Compose / CI hosts — no TLS.
_LOCAL_HOSTS = frozenset({'localhost', '127.0.0.1', '::1', 'db'})


def asyncpg_connect_args(database_url: str) -> dict[str, object]:
    """Return ``connect_args`` for asyncpg.

    Supabase and other remote Postgres require TLS. Local Compose (`db`) and
    loopback do not. Prefer this over ``?ssl=require`` query params, which are
    unreliable with ``postgresql+asyncpg``.
    """
    host = (make_url(database_url).host or '').lower()
    if host in _LOCAL_HOSTS or host.endswith('.local'):
        return {}
    return {'ssl': True}
