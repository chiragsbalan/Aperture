"""Username live-availability check (ADR-0018).

Pipeline: normalize → format → reserved → optional bloom → exact Postgres.
Soft-deleted usernames count as taken until reclaim ships.
"""

from __future__ import annotations

import logging
import uuid
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.users import repository as users_repository
from app.users.bloom import get_username_bloom
from app.users.usernames import (
    is_reserved_username,
    is_valid_username,
    normalize_username,
)

logger = logging.getLogger(__name__)

UsernameAvailabilityStatus = Literal['available', 'taken', 'invalid']


async def check_username_availability(
    session: AsyncSession,
    *,
    username: str,
    bloom_enabled: bool,
    caller_user_id: uuid.UUID | None = None,
    caller_username: str | None = None,
) -> UsernameAvailabilityStatus:
    """Return availability status for a candidate username.

    Invalid shape → ``invalid`` (HTTP 200 envelope). Reserved → ``taken``.
    When bloom is enabled and ready, a definite negative may short-circuit to
    ``available``. Bloom positive always confirms with Postgres (including
    soft-deleted rows). Caller's current username is ``available``.
    """
    normalized = normalize_username(username)
    if not is_valid_username(normalized):
        return 'invalid'
    if is_reserved_username(normalized):
        return 'taken'
    if caller_username is not None and normalized == caller_username:
        return 'available'

    if bloom_enabled:
        bloom = get_username_bloom()
        if bloom is not None:
            maybe = await bloom.might_contain(normalized)
            if maybe is False:
                return 'available'
            # True / None → fall through to exact DB check.

    holder_id = await users_repository.get_username_holder_id(
        session,
        normalized,
        include_deleted=True,
    )
    if holder_id is None:
        return 'available'
    if caller_user_id is not None and holder_id == caller_user_id:
        return 'available'
    return 'taken'


async def bloom_add_username(username: str) -> None:
    """Best-effort bloom insert after a successful claim (register / rename)."""
    bloom = get_username_bloom()
    if bloom is None:
        return
    normalized = normalize_username(username)
    if not normalized:
        return
    try:
        await bloom.add(normalized)
    except Exception:
        logger.warning('username bloom add failed', exc_info=True)


async def rebuild_username_bloom(session: AsyncSession) -> None:
    """Rebuild the bloom from all usernames (including soft-deleted)."""
    bloom = get_username_bloom()
    if bloom is None:
        return
    names = await users_repository.list_all_usernames(session)
    await bloom.rebuild(names)
    logger.info('username bloom rebuilt (%s usernames)', len(names))
