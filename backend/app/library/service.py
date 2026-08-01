"""Library diary service: watch_entries AuthZ and content validation."""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.content_refs import (
    UnsupportedContentTypeError,
    to_db_content_type,
    to_public_content_type,
)
from app.library import repository as library_repository
from app.library.models import WatchEntry
from app.library.schemas import (
    ContentSummary,
    WatchEntriesPageResponse,
    WatchEntryResponse,
)
from app.metadata import service as metadata_service
from app.users import service as users_service

MAX_NOTE_LENGTH = 1000


class ProfileRequiredError(Exception):
    """Authenticated identity has no Users profile."""


class ContentNotFoundError(Exception):
    """Referenced Aperture content id does not exist."""


class UnsupportedWatchContentError(Exception):
    """Content type is not allowed on diary entries."""


class WatchEntryNotFoundError(Exception):
    """Entry missing or not owned by the caller."""


@dataclass(frozen=True, slots=True)
class ParsedRef:
    """Normalized content pointer for persistence."""

    db_type: str
    content_id: uuid.UUID
    public_type: str


async def _require_owner_user_id(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
) -> uuid.UUID:
    profile = await users_service.get_profile_for_identity(
        session,
        identity_id=identity_id,
    )
    if profile is None:
        raise ProfileRequiredError('profile not found')
    return profile.id


def _parse_ref(*, content_type: str, content_id: uuid.UUID) -> ParsedRef:
    try:
        db_type = to_db_content_type(content_type)
    except UnsupportedContentTypeError as exc:
        raise UnsupportedWatchContentError(str(exc)) from exc
    return ParsedRef(
        db_type=db_type,
        content_id=content_id,
        public_type=to_public_content_type(db_type),
    )


async def _validate_content_exists(
    session: AsyncSession,
    *,
    ref: ParsedRef,
) -> None:
    exists = await metadata_service.content_exists(
        session,
        content_type=ref.db_type,
        content_id=ref.content_id,
    )
    if not exists:
        raise ContentNotFoundError('content not found')


def _entry_response(
    entry: WatchEntry,
    summary: metadata_service.ContentSummaryDTO | None,
) -> WatchEntryResponse:
    if summary is None:
        content = ContentSummary(
            type=to_public_content_type(entry.content_type),
            id=entry.content_id,
            title='Unavailable title',
            year=None,
            poster_url=None,
        )
    else:
        content = ContentSummary(
            type=to_public_content_type(summary.content_type),
            id=summary.id,
            title=summary.title,
            year=summary.year,
            poster_url=summary.poster_url,
        )
    return WatchEntryResponse(
        id=entry.id,
        watched_at=entry.watched_at,
        note=entry.note,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        content=content,
    )


def _normalize_note(note: str | None) -> str | None:
    if note is None:
        return None
    cleaned = note.strip()
    if not cleaned:
        return None
    if len(cleaned) > MAX_NOTE_LENGTH:
        raise UnsupportedWatchContentError('note too long')
    return cleaned


async def create_entry(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    content_type: str,
    content_id: uuid.UUID,
    watched_at: dt.date | None,
    note: str | None,
    commit: bool = True,
) -> WatchEntryResponse:
    """Create a diary entry. Pass ``commit=False`` for composed transactions."""
    ref = _parse_ref(content_type=content_type, content_id=content_id)
    await _validate_content_exists(session, ref=ref)
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    day = watched_at or dt.datetime.now(dt.UTC).date()
    entry = await library_repository.insert_entry(
        session,
        owner_user_id=owner_user_id,
        content_type=ref.db_type,
        content_id=ref.content_id,
        watched_at=day,
        note=_normalize_note(note),
    )
    if commit:
        await session.commit()
    else:
        await session.flush()

    summaries = await metadata_service.get_content_summaries(
        session,
        refs=[(ref.db_type, ref.content_id)],
    )
    return _entry_response(entry, summaries[0] if summaries else None)


async def list_entries(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    page: int,
    limit: int,
    year: int | None = None,
    month: int | None = None,
) -> WatchEntriesPageResponse:
    """Return the caller's diary feed (newest first)."""
    if month is not None and year is None:
        raise UnsupportedWatchContentError('year required when month is set')
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    total = await library_repository.count_entries(
        session,
        owner_user_id=owner_user_id,
        year=year,
        month=month,
    )
    offset = (page - 1) * limit
    entries = await library_repository.list_entries_page(
        session,
        owner_user_id=owner_user_id,
        offset=offset,
        limit=limit,
        year=year,
        month=month,
    )
    refs = [(row.content_type, row.content_id) for row in entries]
    summaries = await metadata_service.get_content_summaries(session, refs=refs)
    summary_by_key = {(row.content_type, row.id): row for row in summaries}
    items = [
        _entry_response(
            entry,
            summary_by_key.get((entry.content_type, entry.content_id)),
        )
        for entry in entries
    ]
    return WatchEntriesPageResponse(
        page=page,
        limit=limit,
        total=total,
        items=items,
    )


async def patch_entry(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    entry_id: uuid.UUID,
    watched_at: dt.date | None,
    note: str | None,
    note_set: bool,
) -> WatchEntryResponse:
    """Update watched_at and/or note on an owned entry."""
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    entry = await library_repository.get_entry_for_owner(
        session,
        owner_user_id=owner_user_id,
        entry_id=entry_id,
    )
    if entry is None:
        raise WatchEntryNotFoundError('entry not found')
    if watched_at is not None:
        entry.watched_at = watched_at
    if note_set:
        entry.note = _normalize_note(note)
    await session.commit()
    await session.refresh(entry)
    summaries = await metadata_service.get_content_summaries(
        session,
        refs=[(entry.content_type, entry.content_id)],
    )
    return _entry_response(entry, summaries[0] if summaries else None)


async def delete_entry(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    entry_id: uuid.UUID,
) -> None:
    """Delete an owned diary entry (404 if missing)."""
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    deleted = await library_repository.delete_entry_for_owner(
        session,
        owner_user_id=owner_user_id,
        entry_id=entry_id,
    )
    if not deleted:
        raise WatchEntryNotFoundError('entry not found')
    await session.commit()
