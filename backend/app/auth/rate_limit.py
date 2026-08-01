"""DB-backed auth rate limits (P1.2; Redis CacheBackend in P2.4)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import repository as auth_repository
from app.auth.security import hash_rate_limit_subject
from app.core.config import Settings

ACTION_LOGIN = 'login'
ACTION_REGISTER = 'register'
ACTION_REFRESH = 'refresh'


def _subject_id_key(raw: str) -> str:
    return f'id:{hash_rate_limit_subject(raw.strip().lower())}'


def _subject_ip_key(ip: str) -> str:
    return f'ip:{hash_rate_limit_subject(ip.strip())}'


def _rate_limited_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail='Too many attempts. Try again later.',
    )


async def _is_limited(
    session: AsyncSession,
    *,
    action: str,
    subject_key: str,
    max_attempts: int,
    window_seconds: int,
    now: datetime,
) -> bool:
    row = await auth_repository.get_failed_attempt(
        session,
        action=action,
        subject_key=subject_key,
    )
    if row is None:
        return False
    if now - row.window_started_at >= timedelta(seconds=window_seconds):
        return False
    return row.attempt_count >= max_attempts


async def _record(
    session: AsyncSession,
    *,
    action: str,
    subject_key: str,
    window_seconds: int,
    now: datetime,
) -> None:
    await auth_repository.upsert_failed_attempt(
        session,
        action=action,
        subject_key=subject_key,
        window_started_at=now,
        window_seconds=window_seconds,
    )


async def enforce_login_limits(
    session: AsyncSession,
    *,
    settings: Settings,
    identifier: str,
    client_ip: str | None,
) -> None:
    """Raise 429 when login identifier or IP has exceeded failure limits."""
    now = datetime.now(UTC)
    window = settings.auth_rate_limit_window_seconds
    max_failures = settings.auth_login_max_failures
    keys = [_subject_id_key(identifier)]
    if client_ip:
        keys.append(_subject_ip_key(client_ip))
    for key in keys:
        if await _is_limited(
            session,
            action=ACTION_LOGIN,
            subject_key=key,
            max_attempts=max_failures,
            window_seconds=window,
            now=now,
        ):
            raise _rate_limited_error()


async def record_login_failure(
    session: AsyncSession,
    *,
    settings: Settings,
    identifier: str,
    client_ip: str | None,
) -> None:
    """Increment durable login failure counters and commit."""
    now = datetime.now(UTC)
    window = settings.auth_rate_limit_window_seconds
    await _record(
        session,
        action=ACTION_LOGIN,
        subject_key=_subject_id_key(identifier),
        window_seconds=window,
        now=now,
    )
    if client_ip:
        await _record(
            session,
            action=ACTION_LOGIN,
            subject_key=_subject_ip_key(client_ip),
            window_seconds=window,
            now=now,
        )
    await session.commit()


async def clear_login_failures(
    session: AsyncSession,
    *,
    identifier: str,
    client_ip: str | None = None,
) -> None:
    """Clear identifier and IP login failure buckets after success."""
    await auth_repository.clear_failed_attempt(
        session,
        action=ACTION_LOGIN,
        subject_key=_subject_id_key(identifier),
    )
    if client_ip:
        await auth_repository.clear_failed_attempt(
            session,
            action=ACTION_LOGIN,
            subject_key=_subject_ip_key(client_ip),
        )


async def enforce_register_limits(
    session: AsyncSession,
    *,
    settings: Settings,
    email: str,
    client_ip: str | None,
) -> None:
    """Raise 429 when register email or IP has exceeded failure limits."""
    now = datetime.now(UTC)
    window = settings.auth_rate_limit_window_seconds
    max_failures = settings.auth_register_max_failures
    keys = [_subject_id_key(email)]
    if client_ip:
        keys.append(_subject_ip_key(client_ip))
    for key in keys:
        if await _is_limited(
            session,
            action=ACTION_REGISTER,
            subject_key=key,
            max_attempts=max_failures,
            window_seconds=window,
            now=now,
        ):
            raise _rate_limited_error()


async def record_register_failure(
    session: AsyncSession,
    *,
    settings: Settings,
    email: str,
    client_ip: str | None,
) -> None:
    """Increment durable register failure counters and commit."""
    now = datetime.now(UTC)
    window = settings.auth_rate_limit_window_seconds
    await _record(
        session,
        action=ACTION_REGISTER,
        subject_key=_subject_id_key(email),
        window_seconds=window,
        now=now,
    )
    if client_ip:
        await _record(
            session,
            action=ACTION_REGISTER,
            subject_key=_subject_ip_key(client_ip),
            window_seconds=window,
            now=now,
        )
    await session.commit()


async def enforce_refresh_limits(
    session: AsyncSession,
    *,
    settings: Settings,
    client_ip: str | None,
) -> None:
    """Raise 429 when refresh IP has exceeded the per-window failure cap."""
    if not client_ip:
        return
    now = datetime.now(UTC)
    if await _is_limited(
        session,
        action=ACTION_REFRESH,
        subject_key=_subject_ip_key(client_ip),
        max_attempts=settings.auth_refresh_max_per_ip,
        window_seconds=settings.auth_rate_limit_window_seconds,
        now=now,
    ):
        raise _rate_limited_error()


async def record_refresh_attempt(
    session: AsyncSession,
    *,
    settings: Settings,
    client_ip: str | None,
) -> None:
    """Count a *failed* refresh against the IP bucket (anti-abuse)."""
    if not client_ip:
        return
    now = datetime.now(UTC)
    await _record(
        session,
        action=ACTION_REFRESH,
        subject_key=_subject_ip_key(client_ip),
        window_seconds=settings.auth_rate_limit_window_seconds,
        now=now,
    )
    await session.commit()
