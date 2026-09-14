"""Library diary service: watch_entries AuthZ and content validation."""

from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.content_refs import (
    UnsupportedContentTypeError,
    to_db_content_type,
    to_public_content_type,
)
from app.library import rating_stats as rating_stats_service
from app.library import repository as library_repository
from app.library.models import WatchEntry
from app.library.schemas import (
    ContentSummary,
    RatingFilter,
    RatingSort,
    ReviewAuthor,
    ReviewResponse,
    ReviewSort,
    ReviewsPageResponse,
    SpoilerFilter,
    TitleRatingItem,
    TitleRatingsPageResponse,
    VoteValue,
    WatchEntriesContainsResponse,
    WatchEntriesPageResponse,
    WatchEntriesRatingsResponse,
    WatchEntryResponse,
)
from app.metadata import service as metadata_service
from app.users import repository as users_repository
from app.users import service as users_service
from app.users.models import User
from app.users.preferences import normalize_preferences

MAX_NOTE_LENGTH = 1000


class ProfileRequiredError(Exception):
    """Authenticated identity has no Users profile."""


class ContentNotFoundError(Exception):
    """Referenced Aperture content id does not exist."""


class UnsupportedWatchContentError(Exception):
    """Content type is not allowed on diary entries."""


class WatchEntryNotFoundError(Exception):
    """Entry missing or not owned by the caller."""


class SelfVoteError(Exception):
    """Caller tried to vote on their own review."""


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
        rating=float(entry.rating) if entry.rating is not None else None,
        contains_spoilers=bool(entry.contains_spoilers),
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


def _normalize_rating(rating: float | None) -> Decimal | None:
    if rating is None:
        return None
    return Decimal(str(rating))


async def create_entry(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    content_type: str,
    content_id: uuid.UUID,
    watched_at: dt.date | None,
    note: str | None,
    rating: float | None = None,
    contains_spoilers: bool = False,
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
    normalized_rating = _normalize_rating(rating)
    entry = await library_repository.insert_entry(
        session,
        owner_user_id=owner_user_id,
        content_type=ref.db_type,
        content_id=ref.content_id,
        watched_at=day,
        note=_normalize_note(note),
        rating=normalized_rating,
        contains_spoilers=contains_spoilers,
    )
    if normalized_rating is not None:
        await rating_stats_service.recompute_for_title(
            session,
            content_type=ref.db_type,
            content_id=ref.content_id,
        )
    if commit:
        await session.commit()
        if normalized_rating is not None:
            await rating_stats_service.invalidate_title_detail_cache(
                content_type=ref.db_type,
                content_id=ref.content_id,
            )
    else:
        await session.flush()

    summaries = await metadata_service.get_content_summaries(
        session,
        refs=[(ref.db_type, ref.content_id)],
    )
    return _entry_response(entry, summaries[0] if summaries else None)


async def count_logged_titles_by_type(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    content_type: str,
) -> int:
    """Count distinct diary titles for ``movie`` or ``tv_show``."""
    return await library_repository.count_distinct_titles_by_type(
        session,
        owner_user_id=owner_user_id,
        content_type=content_type,
    )


async def contains_logged_titles(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    refs: list[tuple[str, uuid.UUID]],
) -> WatchEntriesContainsResponse:
    """Batch check: owner has ≥1 diary row for each public ``type:id``.

    Unsupported content types are answered as ``false`` (not omitted) so
    clients always see a key per well-formed request token. Malformed tokens
    are rejected earlier by the API parser (422).
    """
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    membership: dict[str, bool] = {}
    parsed: list[tuple[str, str, uuid.UUID]] = []
    for content_type, content_id in refs:
        try:
            ref = _parse_ref(content_type=content_type, content_id=content_id)
        except UnsupportedWatchContentError:
            membership[f'{content_type}:{content_id}'] = False
            continue
        parsed.append((ref.public_type, ref.db_type, ref.content_id))

    present = await library_repository.content_refs_with_entries(
        session,
        owner_user_id=owner_user_id,
        refs=[(db_type, content_id) for _, db_type, content_id in parsed],
    )
    for public_type, db_type, content_id in parsed:
        key = f'{public_type}:{content_id}'
        membership[key] = (db_type, content_id) in present
    return WatchEntriesContainsResponse(membership=membership)


async def latest_ratings_for_titles(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    refs: list[tuple[str, uuid.UUID]],
) -> WatchEntriesRatingsResponse:
    """Latest non-null diary rating per public ``type:id``.

    Unknown, unsupported, and unrated ids are omitted (not listed as null).
    """
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    parsed: list[tuple[str, str, uuid.UUID]] = []
    seen: set[tuple[str, uuid.UUID]] = set()
    for content_type, content_id in refs:
        try:
            ref = _parse_ref(content_type=content_type, content_id=content_id)
        except UnsupportedWatchContentError:
            continue
        key = (ref.db_type, ref.content_id)
        if key in seen:
            continue
        seen.add(key)
        parsed.append((ref.public_type, ref.db_type, ref.content_id))

    found = await library_repository.latest_ratings_for_refs(
        session,
        owner_user_id=owner_user_id,
        refs=[(db_type, content_id) for _, db_type, content_id in parsed],
    )
    ratings: dict[str, float] = {}
    for public_type, db_type, content_id in parsed:
        value = found.get((db_type, content_id))
        if value is None:
            continue
        ratings[f'{public_type}:{content_id}'] = float(value)
    return WatchEntriesRatingsResponse(ratings=ratings)


async def list_entries_for_owner(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    page: int,
    limit: int,
    year: int | None = None,
    month: int | None = None,
) -> WatchEntriesPageResponse:
    """Return a user's diary feed by profile id (newest first)."""
    if month is not None and year is None:
        raise UnsupportedWatchContentError('year required when month is set')
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
    owner_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    return await list_entries_for_owner(
        session,
        owner_user_id=owner_user_id,
        page=page,
        limit=limit,
        year=year,
        month=month,
    )


async def patch_entry(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    entry_id: uuid.UUID,
    watched_at: dt.date | None,
    note: str | None,
    note_set: bool,
    rating: float | None = None,
    rating_set: bool = False,
    contains_spoilers: bool | None = None,
    contains_spoilers_set: bool = False,
) -> WatchEntryResponse:
    """Update watched_at, note, and/or rating on an owned entry."""
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
    if rating_set:
        entry.rating = _normalize_rating(rating)
    if contains_spoilers_set and contains_spoilers is not None:
        entry.contains_spoilers = contains_spoilers
    # Rating or watch day can change which diary row is "latest" for the user.
    refresh_stats = rating_set or watched_at is not None
    if refresh_stats:
        await rating_stats_service.recompute_for_title(
            session,
            content_type=entry.content_type,
            content_id=entry.content_id,
        )
    await session.commit()
    if refresh_stats:
        await rating_stats_service.invalidate_title_detail_cache(
            content_type=entry.content_type,
            content_id=entry.content_id,
        )
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
    entry = await library_repository.get_entry_for_owner(
        session,
        owner_user_id=owner_user_id,
        entry_id=entry_id,
    )
    if entry is None:
        raise WatchEntryNotFoundError('entry not found')
    content_type = entry.content_type
    content_id = entry.content_id
    had_rating = entry.rating is not None
    deleted = await library_repository.delete_entry_for_owner(
        session,
        owner_user_id=owner_user_id,
        entry_id=entry_id,
    )
    if not deleted:
        raise WatchEntryNotFoundError('entry not found')
    if had_rating:
        await rating_stats_service.recompute_for_title(
            session,
            content_type=content_type,
            content_id=content_id,
        )
    await session.commit()
    if had_rating:
        await rating_stats_service.invalidate_title_detail_cache(
            content_type=content_type,
            content_id=content_id,
        )


@dataclass(frozen=True, slots=True)
class _ViewerContext:
    """Resolved viewer for public review lists and votes."""

    user_id: uuid.UUID | None
    spoilers: str


async def _viewer_context(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID | None,
) -> _ViewerContext:
    if identity_id is None:
        return _ViewerContext(user_id=None, spoilers='hide')
    user = await users_repository.get_user_by_identity_id(
        session,
        identity_id,
    )
    if user is None:
        return _ViewerContext(user_id=None, spoilers='hide')
    prefs = normalize_preferences(user.preferences)
    return _ViewerContext(user_id=user.id, spoilers=prefs['spoilers'])


def _resolved_spoiler_filter(
    requested: SpoilerFilter | None,
    *,
    viewer: _ViewerContext,
) -> SpoilerFilter:
    if requested is not None:
        return requested
    return 'all' if viewer.spoilers == 'show' else 'no_spoilers'


def _normalize_viewer_vote(vote: int | None) -> VoteValue | None:
    if vote == 1:
        return 1
    if vote == -1:
        return -1
    return None


def _content_summary(
    entry: WatchEntry,
    summary: metadata_service.ContentSummaryDTO | None,
) -> ContentSummary:
    if summary is None:
        return ContentSummary(
            type=to_public_content_type(entry.content_type),
            id=entry.content_id,
            title='Unavailable title',
            year=None,
            poster_url=None,
        )
    return ContentSummary(
        type=to_public_content_type(summary.content_type),
        id=summary.id,
        title=summary.title,
        year=summary.year,
        poster_url=summary.poster_url,
    )


def _review_response(
    entry: WatchEntry,
    author: User,
    *,
    viewer: _ViewerContext,
    viewer_vote: int | None,
    summary: metadata_service.ContentSummaryDTO | None,
    include_note_ids: set[uuid.UUID],
    force_include_note: bool = False,
) -> ReviewResponse:
    username = author.username or ''
    is_author = viewer.user_id is not None and viewer.user_id == entry.owner_user_id
    include_note = True
    if entry.contains_spoilers and not is_author and not force_include_note:
        include_note = entry.id in include_note_ids
    note = entry.note if include_note else None
    like_count = int(entry.like_count)
    dislike_count = int(entry.dislike_count)
    rating = float(entry.rating) if entry.rating is not None else 0.0
    vote: VoteValue | None = (
        _normalize_viewer_vote(viewer_vote)
        if viewer.user_id is not None
        else None
    )
    return ReviewResponse(
        id=entry.id,
        rating=rating,
        contains_spoilers=bool(entry.contains_spoilers),
        watched_at=entry.watched_at,
        like_count=like_count,
        dislike_count=dislike_count,
        score=like_count - dislike_count,
        author=ReviewAuthor(
            username=username,
            display_name=author.display_name,
            avatar_url=author.avatar_url,
        ),
        viewer_vote=vote,
        content=_content_summary(entry, summary),
        note=note,
        include_note=include_note,
    )


async def _page_reviews(
    session: AsyncSession,
    *,
    rows: list[tuple[WatchEntry, User, int | None]],
    viewer: _ViewerContext,
    include_note_ids: set[uuid.UUID],
    page: int,
    limit: int,
    total: int,
) -> ReviewsPageResponse:
    refs = [(row[0].content_type, row[0].content_id) for row in rows]
    summaries = await metadata_service.get_content_summaries(session, refs=refs)
    summary_by_key = {(row.content_type, row.id): row for row in summaries}
    items = [
        _review_response(
            entry,
            author,
            viewer=viewer,
            viewer_vote=vote,
            summary=summary_by_key.get((entry.content_type, entry.content_id)),
            include_note_ids=include_note_ids,
        )
        for entry, author, vote in rows
    ]
    return ReviewsPageResponse(
        page=page,
        limit=limit,
        total=total,
        items=items,
    )


async def list_title_reviews(
    session: AsyncSession,
    *,
    content_type: str,
    content_id: uuid.UUID,
    identity_id: uuid.UUID | None,
    page: int,
    limit: int,
    sort: ReviewSort = 'popular',
    spoiler_filter: SpoilerFilter | None = None,
    rating_filter: RatingFilter = 'any',
    include_note_ids: list[uuid.UUID] | None = None,
) -> ReviewsPageResponse:
    """Public reviews for a catalog title (qualifying watch logs only)."""
    ref = _parse_ref(content_type=content_type, content_id=content_id)
    await _validate_content_exists(session, ref=ref)
    viewer = await _viewer_context(session, identity_id=identity_id)
    resolved_filter = _resolved_spoiler_filter(
        spoiler_filter,
        viewer=viewer,
    )
    total = await library_repository.count_title_reviews(
        session,
        content_type=ref.db_type,
        content_id=ref.content_id,
        spoiler_filter=resolved_filter,
        rating_filter=rating_filter,
    )
    offset = (page - 1) * limit
    rows = await library_repository.list_title_reviews_page(
        session,
        content_type=ref.db_type,
        content_id=ref.content_id,
        sort=sort,
        spoiler_filter=resolved_filter,
        rating_filter=rating_filter,
        offset=offset,
        limit=limit,
        viewer_user_id=viewer.user_id,
    )
    return await _page_reviews(
        session,
        rows=rows,
        viewer=viewer,
        include_note_ids=set(include_note_ids or []),
        page=page,
        limit=limit,
        total=total,
    )


async def get_title_review(
    session: AsyncSession,
    *,
    content_type: str,
    content_id: uuid.UUID,
    entry_id: uuid.UUID,
    identity_id: uuid.UUID | None,
) -> ReviewResponse:
    """Public reveal of one qualifying review, including spoiler text."""
    ref = _parse_ref(content_type=content_type, content_id=content_id)
    await _validate_content_exists(session, ref=ref)
    viewer = await _viewer_context(session, identity_id=identity_id)
    row = await library_repository.get_eligible_review(
        session,
        entry_id=entry_id,
        content_type=ref.db_type,
        content_id=ref.content_id,
        viewer_user_id=viewer.user_id,
    )
    if row is None:
        raise WatchEntryNotFoundError('entry not found')
    entry, author, vote = row
    summaries = await metadata_service.get_content_summaries(
        session,
        refs=[(entry.content_type, entry.content_id)],
    )
    return _review_response(
        entry,
        author,
        viewer=viewer,
        viewer_vote=vote,
        summary=summaries[0] if summaries else None,
        include_note_ids=set(),
        force_include_note=True,
    )


async def list_title_ratings(
    session: AsyncSession,
    *,
    content_type: str,
    content_id: uuid.UUID,
    page: int,
    limit: int,
    sort: RatingSort = 'highest',
) -> TitleRatingsPageResponse:
    """Latest non-null diary rating per live user for a title."""
    ref = _parse_ref(content_type=content_type, content_id=content_id)
    await _validate_content_exists(session, ref=ref)
    total = await library_repository.count_title_ratings(
        session,
        content_type=ref.db_type,
        content_id=ref.content_id,
    )
    offset = (page - 1) * limit
    rows = await library_repository.list_title_ratings_page(
        session,
        content_type=ref.db_type,
        content_id=ref.content_id,
        sort=sort,
        offset=offset,
        limit=limit,
    )
    items = [
        TitleRatingItem(
            rating=float(rating),
            watched_at=watched_at,
            author=ReviewAuthor(
                username=author.username or '',
                display_name=author.display_name,
                avatar_url=author.avatar_url,
            ),
        )
        for author, rating, watched_at in rows
    ]
    return TitleRatingsPageResponse(
        page=page,
        limit=limit,
        total=total,
        items=items,
    )


async def list_user_reviews(
    session: AsyncSession,
    *,
    owner_user_id: uuid.UUID,
    identity_id: uuid.UUID | None,
    page: int,
    limit: int,
    sort: ReviewSort = 'recent',
    spoiler_filter: SpoilerFilter | None = None,
    rating_filter: RatingFilter = 'any',
    include_note_ids: list[uuid.UUID] | None = None,
) -> ReviewsPageResponse:
    """Public qualifying reviews for a profile (newest first by default)."""
    viewer = await _viewer_context(session, identity_id=identity_id)
    resolved_filter = _resolved_spoiler_filter(
        spoiler_filter,
        viewer=viewer,
    )
    total = await library_repository.count_owner_reviews(
        session,
        owner_user_id=owner_user_id,
        spoiler_filter=resolved_filter,
        rating_filter=rating_filter,
    )
    offset = (page - 1) * limit
    rows = await library_repository.list_owner_reviews_page(
        session,
        owner_user_id=owner_user_id,
        sort=sort,
        spoiler_filter=resolved_filter,
        rating_filter=rating_filter,
        offset=offset,
        limit=limit,
        viewer_user_id=viewer.user_id,
    )
    return await _page_reviews(
        session,
        rows=rows,
        viewer=viewer,
        include_note_ids=set(include_note_ids or []),
        page=page,
        limit=limit,
        total=total,
    )


async def put_review_vote(
    session: AsyncSession,
    *,
    identity_id: uuid.UUID,
    entry_id: uuid.UUID,
    vote: int | None,
) -> ReviewResponse:
    """Idempotent upsert of the caller's like/dislike (or clear)."""
    voter_user_id = await _require_owner_user_id(
        session,
        identity_id=identity_id,
    )
    entry = await library_repository.get_eligible_review_for_update(
        session,
        entry_id=entry_id,
    )
    if entry is None:
        raise WatchEntryNotFoundError('entry not found')
    if entry.owner_user_id == voter_user_id:
        raise SelfVoteError('self_vote_forbidden')
    existing = await library_repository.get_vote_for_update(
        session,
        watch_entry_id=entry.id,
        voter_user_id=voter_user_id,
    )
    like_delta = 0
    dislike_delta = 0
    if vote is None:
        if existing is not None:
            if existing.vote == 1:
                like_delta = -1
            else:
                dislike_delta = -1
            await library_repository.delete_vote(session, vote=existing)
            existing = None
    elif existing is None:
        await library_repository.insert_vote(
            session,
            watch_entry_id=entry.id,
            voter_user_id=voter_user_id,
            vote=vote,
        )
        if vote == 1:
            like_delta = 1
        else:
            dislike_delta = 1
        existing = None
    elif existing.vote != vote:
        if existing.vote == 1:
            like_delta = -1
            dislike_delta = 1
        else:
            like_delta = 1
            dislike_delta = -1
        existing.vote = vote
    await library_repository.apply_vote_count_delta(
        session,
        entry_id=entry.id,
        like_delta=like_delta,
        dislike_delta=dislike_delta,
    )
    await session.commit()
    await session.refresh(entry)
    owner = await users_repository.get_user_by_id(session, entry.owner_user_id)
    if owner is None:
        raise WatchEntryNotFoundError('entry not found')
    viewer = await _viewer_context(session, identity_id=identity_id)
    summaries = await metadata_service.get_content_summaries(
        session,
        refs=[(entry.content_type, entry.content_id)],
    )
    return _review_response(
        entry,
        owner,
        viewer=viewer,
        viewer_vote=_normalize_viewer_vote(vote),
        summary=summaries[0] if summaries else None,
        include_note_ids=set(),
    )
