"""Person enrichment curation (ADR-0017).

Builds allowlisted socials and capped known-for / filmography cards from TMDb
combined_credits (+ external_ids) or from Postgres ``content_credits`` fallback.

Known for is a separate pass (cap ``MAX_KNOWN_FOR``) over the full parsed
credit set. Principal roles in the person's department come first (popularity
descending). Guest appearances fill leftover slots and never outrank those
roles. Filmography remains a popularity-capped multi-dept list.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any
from urllib.parse import urlparse

from app.metadata.images import InvalidImagePathError, tmdb_image_url
from app.metadata.models import ContentCredit, ContentItem, Person
from app.metadata.schemas import PersonSocialLink, PersonTitleCard, TitleRating
from app.metadata.title_rating import resolve_title_rating, tmdb_vote_to_stars

MAX_KNOWN_FOR = 30
MAX_FILMOGRAPHY = 150
MAX_ALSO_KNOWN_AS = 20

# Bucket order for Known for after the person's primary known_for_department.
DEPARTMENT_PRECEDENCE: tuple[str, ...] = (
    'Acting',
    'Directing',
    'Writing',
    'Production',
    'Editing',
    'Camera',
    'Sound',
    'Art',
    'Costume & Make-Up',
    'Visual Effects',
    'Lighting',
    'Creator',
    'Crew',
)

# Host allowlist for person social / homepage links (HTTPS only).
_SOCIAL_HOSTS: dict[str, tuple[str, ...]] = {
    'imdb': ('www.imdb.com', 'imdb.com'),
    'instagram': ('www.instagram.com', 'instagram.com'),
    'x': ('x.com', 'twitter.com', 'www.twitter.com'),
    'facebook': ('www.facebook.com', 'facebook.com', 'fb.com', 'www.fb.com'),
    'tiktok': ('www.tiktok.com', 'tiktok.com'),
    'youtube': ('www.youtube.com', 'youtube.com', 'youtu.be'),
    'wikidata': ('www.wikidata.org', 'wikidata.org'),
}

_HOMEPAGE_BLOCKED_HOSTS = frozenset(
    {
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '::1',
    }
)


def require_https_url(value: str) -> str | None:
    """Return a cleaned https URL or None when invalid."""
    cleaned = value.strip()
    parsed = urlparse(cleaned)
    if parsed.scheme != 'https' or not parsed.netloc:
        return None
    return cleaned


def _host_allowed(kind: str, host: str) -> bool:
    allowed = _SOCIAL_HOSTS.get(kind)
    if allowed is None:
        return False
    lowered = host.lower().rstrip('.')
    return lowered in allowed


def social_link_from_parts(
    *,
    kind: str,
    label: str,
    url: str,
) -> PersonSocialLink | None:
    """Validate HTTPS + host allowlist; reject raw untrusted hrefs."""
    cleaned = require_https_url(url)
    if cleaned is None:
        return None
    host = urlparse(cleaned).hostname or ''
    if not _host_allowed(kind, host):
        return None
    return PersonSocialLink(kind=kind, label=label, url=cleaned)


def homepage_social(url: str | None) -> PersonSocialLink | None:
    """Allow https homepage when host is not local / empty."""
    if not url:
        return None
    cleaned = require_https_url(url)
    if cleaned is None:
        return None
    host = (urlparse(cleaned).hostname or '').lower().rstrip('.')
    if not host or host in _HOMEPAGE_BLOCKED_HOSTS:
        return None
    # Homepage is not a fixed social network; still require https + real host.
    if host.endswith('.local') or host.endswith('.internal'):
        return None
    return PersonSocialLink(kind='homepage', label='Website', url=cleaned)


def socials_from_external_ids(
    external_ids: dict[str, Any] | None,
    *,
    homepage: str | None = None,
) -> list[PersonSocialLink]:
    """Build allowlisted social chips from TMDb external_ids (+ optional homepage)."""
    links: list[PersonSocialLink] = []
    raw = external_ids if isinstance(external_ids, dict) else {}

    imdb_id = raw.get('imdb_id')
    if isinstance(imdb_id, str) and imdb_id.strip():
        link = social_link_from_parts(
            kind='imdb',
            label='IMDb',
            url=f'https://www.imdb.com/name/{imdb_id.strip()}/',
        )
        if link is not None:
            links.append(link)

    instagram = raw.get('instagram_id')
    if isinstance(instagram, str) and instagram.strip():
        handle = instagram.strip().lstrip('@')
        link = social_link_from_parts(
            kind='instagram',
            label='Instagram',
            url=f'https://www.instagram.com/{handle}/',
        )
        if link is not None:
            links.append(link)

    twitter = raw.get('twitter_id')
    if isinstance(twitter, str) and twitter.strip():
        handle = twitter.strip().lstrip('@')
        link = social_link_from_parts(
            kind='x',
            label='X',
            url=f'https://x.com/{handle}',
        )
        if link is not None:
            links.append(link)

    facebook = raw.get('facebook_id')
    if isinstance(facebook, str) and facebook.strip():
        handle = facebook.strip()
        link = social_link_from_parts(
            kind='facebook',
            label='Facebook',
            url=f'https://www.facebook.com/{handle}',
        )
        if link is not None:
            links.append(link)

    tiktok = raw.get('tiktok_id')
    if isinstance(tiktok, str) and tiktok.strip():
        handle = tiktok.strip().lstrip('@')
        link = social_link_from_parts(
            kind='tiktok',
            label='TikTok',
            url=f'https://www.tiktok.com/@{handle}',
        )
        if link is not None:
            links.append(link)

    youtube = raw.get('youtube_id')
    if isinstance(youtube, str) and youtube.strip():
        handle = youtube.strip()
        # TMDb may return a channel id or custom handle.
        if handle.startswith('UC') and len(handle) >= 20:
            url = f'https://www.youtube.com/channel/{handle}'
        else:
            url = f'https://www.youtube.com/@{handle.lstrip("@")}'
        link = social_link_from_parts(kind='youtube', label='YouTube', url=url)
        if link is not None:
            links.append(link)

    wikidata = raw.get('wikidata_id')
    if isinstance(wikidata, str) and wikidata.strip():
        link = social_link_from_parts(
            kind='wikidata',
            label='Wikidata',
            url=f'https://www.wikidata.org/wiki/{wikidata.strip()}',
        )
        if link is not None:
            links.append(link)

    home = homepage_social(homepage if isinstance(homepage, str) else None)
    if home is not None:
        links.append(home)
    return links


def _image_url(path: str | None, *, size: str = 'w342') -> str | None:
    if not path:
        return None
    try:
        return tmdb_image_url(path, size=size)
    except InvalidImagePathError:
        return None


def _year_from_date_str(value: str | None) -> int | None:
    if not value or not isinstance(value, str):
        return None
    if len(value) < 4 or not value[:4].isdigit():
        return None
    year = int(value[:4])
    return year if 1800 <= year <= 2100 else None


def _content_year(item: ContentItem) -> int | None:
    if item.movie is not None and item.movie.release_date is not None:
        return item.movie.release_date.year
    if item.tv_show is not None and item.tv_show.first_air_date is not None:
        return item.tv_show.first_air_date.year
    return None


def _content_release_date(item: ContentItem) -> str | None:
    if item.movie is not None and item.movie.release_date is not None:
        return item.movie.release_date.isoformat()
    if item.tv_show is not None and item.tv_show.first_air_date is not None:
        return item.tv_show.first_air_date.isoformat()
    return None


def _content_runtime_minutes(item: ContentItem) -> int | None:
    if item.movie is not None and item.movie.runtime_minutes is not None:
        runtime = int(item.movie.runtime_minutes)
        return runtime if runtime > 0 else None
    return None


def _content_popularity(item: ContentItem) -> float | None:
    if item.popularity is None:
        return None
    try:
        return float(item.popularity)
    except (TypeError, ValueError):
        return None


def _content_rating(item: ContentItem) -> TitleRating | None:
    extras = item.extras if isinstance(item.extras, dict) else None
    return resolve_title_rating(
        extras_doc=extras,
        stats=None,
        switch_threshold=1,
    )


def _popularity_from_row(row: dict[str, Any]) -> float | None:
    raw = row.get('popularity')
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _release_date_from_row(row: dict[str, Any], *, media: str) -> str | None:
    raw = row.get('release_date') if media == 'movie' else row.get('first_air_date')
    if not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    if len(cleaned) < 10:
        return None
    try:
        date.fromisoformat(cleaned[:10])
    except ValueError:
        return None
    return cleaned[:10]


def _runtime_from_row(row: dict[str, Any]) -> int | None:
    raw = row.get('runtime')
    if raw is None:
        return None
    try:
        runtime = int(raw)
    except (TypeError, ValueError):
        return None
    return runtime if runtime > 0 else None


def _rating_from_tmdb_row(row: dict[str, Any]) -> TitleRating | None:
    raw_avg = row.get('vote_average')
    raw_count = row.get('vote_count')
    try:
        vote_average = float(raw_avg) if raw_avg is not None else 0.0
        vote_count = int(raw_count) if raw_count is not None else 0
    except (TypeError, ValueError):
        return None
    if vote_count <= 0 or vote_average <= 0:
        return None
    return TitleRating(
        value=round(tmdb_vote_to_stars(vote_average), 2),
        source='tmdb',
        count=vote_count,
    )


def _public_kind(content_type: str) -> str | None:
    if content_type == 'movie':
        return 'movie'
    if content_type in ('tv', 'tv_show'):
        return 'tv'
    return None


_JOB_TO_DEPARTMENT: dict[str, str] = {
    'Director': 'Directing',
    'Co-Director': 'Directing',
    'Writer': 'Writing',
    'Screenplay': 'Writing',
    'Story': 'Writing',
    'Producer': 'Production',
    'Executive Producer': 'Production',
    'Co-Producer': 'Production',
    'Editor': 'Editing',
}


def _department_for_credit(
    *,
    credit_kind: str,
    job: str | None,
    department: str | None = None,
) -> str:
    if credit_kind == 'cast':
        return 'Acting'
    if isinstance(department, str) and department.strip():
        return department.strip()
    cleaned = (job or '').strip()
    mapped = _JOB_TO_DEPARTMENT.get(cleaned)
    if mapped:
        return mapped
    if cleaned:
        return cleaned
    return 'Crew'


def cards_from_pg_credits(credits: list[ContentCredit]) -> list[PersonTitleCard]:
    """Map durable ingest edges into title cards (fallback / seed path)."""
    cards: list[PersonTitleCard] = []
    seen_dept: set[tuple[uuid.UUID, str]] = set()
    seen_titles: set[uuid.UUID] = set()
    for credit in credits:
        item = credit.content_item
        if item is None:
            continue
        kind = _public_kind(item.content_type)
        if kind is None:
            continue
        job = credit.job or None
        character = credit.character or None
        department = _department_for_credit(
            credit_kind=credit.credit_kind,
            job=job,
        )
        dept_key = (item.id, department)
        if dept_key in seen_dept:
            continue
        if item.id not in seen_titles and len(seen_titles) >= MAX_FILMOGRAPHY:
            continue
        seen_dept.add(dept_key)
        seen_titles.add(item.id)
        cards.append(
            PersonTitleCard(
                type=kind,
                content_id=item.id,
                tmdb_id=None,
                title=item.title,
                year=_content_year(item),
                poster_url=_image_url(item.poster_path),
                credit_kind=credit.credit_kind,
                character=character,
                job=job,
                department=department,
                popularity=_content_popularity(item),
                release_date=_content_release_date(item),
                runtime_minutes=_content_runtime_minutes(item),
                rating=_content_rating(item),
            )
        )
    return cards


def _known_for_title_key(card: PersonTitleCard) -> tuple[str, str, str | int] | None:
    """Stable identity for Known-for uniqueness (TMDb or PG content id)."""
    if card.tmdb_id is not None:
        return ('tmdb', card.type, card.tmdb_id)
    if card.content_id is not None:
        return ('content', card.type, str(card.content_id))
    return None


# News, Reality, Talk. Appearance formats, not scripted series.
_APPEARANCE_TV_GENRES = frozenset({10763, 10764, 10767})
# Hosts billed as Self cross this. A contestant season does not.
_SERIES_REGULAR_EPISODES = 40
# TV crew below this are short stints, not series staff.
_CREW_STAFF_EPISODES = 8


def _parse_genre_ids(row: dict[str, Any]) -> list[int]:
    raw = row.get('genre_ids')
    if not isinstance(raw, list):
        return []
    out: list[int] = []
    for item in raw:
        try:
            out.append(int(item))
        except (TypeError, ValueError):
            continue
    return out


def _parse_episode_count(row: dict[str, Any]) -> int | None:
    raw = row.get('episode_count')
    if raw is None or isinstance(raw, bool):
        return None
    try:
        count = int(raw)
    except (TypeError, ValueError):
        return None
    if count < 0:
        return None
    return count


def _is_self_credit(character: str | None) -> bool:
    if not isinstance(character, str):
        return False
    text = character.strip().lower()
    return (
        text == 'self'
        or text.startswith('self ')
        or text.startswith('self-')
        or text.startswith('self—')
        or text.startswith('self–')
    )


def _self_is_series_regular(character: str, episode_count: int | None) -> bool:
    """Host or regular billed as Self, not a cameo or contestant."""
    if episode_count is None or episode_count < _SERIES_REGULAR_EPISODES:
        return False
    lower = character.lower()
    blocked = (
        'guest',
        'cameo',
        'uncredited',
        'archive',
        'contestant',
        'nominee',
    )
    return not any(word in lower for word in blocked)


def _job_is_guest(job: str | None) -> bool:
    if not isinstance(job, str):
        return False
    return 'guest' in job.lower()


def _is_guest_appearance(card: PersonTitleCard) -> bool:
    """One-off or billed-as-Self appearance, not a principal role.

    A talk-show host or staff producer with a long episode count is not a
    guest. A Self credit, a one-episode acting spot, or a short crew stint is.
    """
    episodes = card.episode_count
    if _job_is_guest(card.job):
        return True
    if card.credit_kind == 'cast' or (card.department or '') == 'Acting':
        if _is_self_credit(card.character):
            return not _self_is_series_regular(
                card.character or '',
                episodes,
            )
        if card.type == 'tv' and episodes == 1:
            return True
        genres = set(card.genre_ids)
        if (
            card.type == 'tv'
            and genres & _APPEARANCE_TV_GENRES
            and (episodes is None or episodes < _SERIES_REGULAR_EPISODES)
        ):
            return True
        return False
    if card.type == 'tv' and episodes is not None and episodes < _CREW_STAFF_EPISODES:
        return True
    return False


def _within_known_for_bucket_key(
    card: PersonTitleCard,
) -> tuple[float, str]:
    """Popularity desc; missing popularity sorts last; then title A–Z."""
    title = (card.title or '').lower()
    return (-(card.popularity or 0.0), title)


def _ordered_known_for_departments(
    departments: set[str],
    *,
    primary: str,
) -> list[str]:
    """Primary dept first, then DEPARTMENT_PRECEDENCE (skipping primary), then A–Z."""
    ordered: list[str] = []
    if primary and primary in departments:
        ordered.append(primary)
    for dept in DEPARTMENT_PRECEDENCE:
        if dept == primary:
            continue
        if dept in departments:
            ordered.append(dept)
    remaining = sorted(d for d in departments if d not in ordered)
    ordered.extend(remaining)
    return ordered


def _take_known_for(
    selected: list[PersonTitleCard],
    seen_titles: set[tuple[str, str, str | int]],
    cards: list[PersonTitleCard],
    *,
    guests: bool,
) -> bool:
    """Append matching cards. Return True when the cap is full."""
    pool = [card for card in cards if _is_guest_appearance(card) is guests]
    for card in sorted(pool, key=_within_known_for_bucket_key):
        key = _known_for_title_key(card)
        if key is None or key in seen_titles:
            continue
        seen_titles.add(key)
        selected.append(card)
        if len(selected) >= MAX_KNOWN_FOR:
            return True
    return False


def select_known_for(
    parsed_cards: list[PersonTitleCard],
    known_for_department: str | None = None,
) -> list[PersonTitleCard]:
    """Pick ≤``MAX_KNOWN_FOR`` cards from the full parsed credit set.

    Primary ``known_for_department`` is filled with principal roles first
    (popularity descending, then title A–Z). Guest appearances only fill
    leftover slots. Acting stays inside Acting (roles, then appearances)
    before any other department. Other professions take principal work in
    department order, then appearances. One card per title; walking the
    primary department first keeps that credit when a title repeats.
    """
    primary = (
        known_for_department.strip() if isinstance(known_for_department, str) else ''
    )
    buckets: dict[str, list[PersonTitleCard]] = {}
    for card in parsed_cards:
        dept = (card.department or 'Crew').strip() or 'Crew'
        buckets.setdefault(dept, []).append(card)

    selected: list[PersonTitleCard] = []
    seen_titles: set[tuple[str, str, str | int]] = set()
    dept_order = _ordered_known_for_departments(set(buckets), primary=primary)

    if primary == 'Acting':
        acting = buckets.get('Acting', [])
        if _take_known_for(selected, seen_titles, acting, guests=False):
            return selected
        if _take_known_for(selected, seen_titles, acting, guests=True):
            return selected
        for dept in dept_order:
            if dept == 'Acting':
                continue
            if _take_known_for(
                selected,
                seen_titles,
                buckets.get(dept, []),
                guests=False,
            ):
                return selected
        for dept in dept_order:
            if dept == 'Acting':
                continue
            if _take_known_for(
                selected,
                seen_titles,
                buckets.get(dept, []),
                guests=True,
            ):
                return selected
        return selected

    for dept in dept_order:
        if _take_known_for(
            selected,
            seen_titles,
            buckets.get(dept, []),
            guests=False,
        ):
            return selected
    for dept in dept_order:
        if _take_known_for(
            selected,
            seen_titles,
            buckets.get(dept, []),
            guests=True,
        ):
            return selected
    return selected


def departments_from_cards(
    cards: list[PersonTitleCard],
    *,
    preferred: str | None = None,
) -> list[str]:
    """Unique department labels; ``preferred`` (known-for) listed first."""
    seen: set[str] = set()
    out: list[str] = []
    for card in cards:
        dept = (card.department or '').strip()
        if not dept or dept in seen:
            continue
        seen.add(dept)
        out.append(dept)
    wanted = (preferred or '').strip()
    if wanted and wanted in seen:
        out = [wanted] + [d for d in out if d != wanted]
    return out


def also_known_as_capped(values: list[Any] | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    if not values:
        return out
    for raw in values:
        if not isinstance(raw, str):
            continue
        name = raw.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
        if len(out) >= MAX_ALSO_KNOWN_AS:
            break
    return out


def _parse_credit_row(
    row: dict[str, Any], *, credit_kind: str
) -> PersonTitleCard | None:
    if row.get('adult') is True:
        return None
    media = row.get('media_type')
    if media not in ('movie', 'tv'):
        return None
    # Episode-level rows occasionally appear with episode fields and no show title.
    if row.get('episode_id') is not None or row.get('season_number') is not None:
        if not row.get('title') and not row.get('name'):
            return None
        # Drop pure episode credits (have episode_id).
        if row.get('episode_id') is not None:
            return None
    try:
        tmdb_id = int(row['id'])
    except (KeyError, TypeError, ValueError):
        return None
    if tmdb_id <= 0:
        return None
    title = row.get('title') or row.get('name')
    if not isinstance(title, str) or not title.strip():
        return None
    release_date = _release_date_from_row(row, media=media)
    year = _year_from_date_str(release_date) or _year_from_date_str(
        row.get('release_date') if media == 'movie' else row.get('first_air_date')
    )
    character = row.get('character') if credit_kind == 'cast' else None
    job = row.get('job') if credit_kind == 'crew' else None
    department = row.get('department') if credit_kind == 'crew' else None
    if credit_kind == 'cast':
        department = 'Acting'
    else:
        department = _department_for_credit(
            credit_kind='crew',
            job=job if isinstance(job, str) else None,
            department=department if isinstance(department, str) else None,
        )
    poster = row.get('poster_path')
    poster_url = _image_url(poster if isinstance(poster, str) else None)
    return PersonTitleCard(
        type=media,
        content_id=None,
        tmdb_id=tmdb_id,
        title=title.strip(),
        year=year,
        poster_url=poster_url,
        credit_kind=credit_kind,
        character=character.strip()
        if isinstance(character, str) and character.strip()
        else None,
        job=job.strip() if isinstance(job, str) and job.strip() else None,
        department=department,
        popularity=_popularity_from_row(row),
        release_date=release_date,
        runtime_minutes=_runtime_from_row(row),
        rating=_rating_from_tmdb_row(row),
        genre_ids=_parse_genre_ids(row),
        episode_count=_parse_episode_count(row),
    )


def _popularity(row: dict[str, Any]) -> float:
    try:
        return float(row.get('popularity') or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _title_key(card: PersonTitleCard) -> tuple[str, int] | None:
    if card.tmdb_id is None:
        return None
    return (card.type, card.tmdb_id)


def _crew_row_rank(row: dict[str, Any]) -> tuple[int, float]:
    job = (row.get('job') or '').strip().lower()
    primary = 0 if job == 'director' else 1
    return (primary, -_popularity(row))


def curate_combined_credits(
    combined: dict[str, Any] | None,
    *,
    known_for_department: str | None = None,
) -> tuple[list[PersonTitleCard], list[PersonTitleCard]]:
    """Return ``(known_for, filmography)`` from TMDb combined_credits.

    Two-pass: filmography keeps one card per ``(title, department)`` with a
    unique-title cap of ``MAX_FILMOGRAPHY`` (preferring known-for department).
    Known for is selected independently via ``select_known_for`` over the full
    parsed set (not a slice of filmography).
    """
    cast_rows = []
    crew_rows = []
    if isinstance(combined, dict):
        raw_cast = combined.get('cast')
        raw_crew = combined.get('crew')
        if isinstance(raw_cast, list):
            cast_rows = [r for r in raw_cast if isinstance(r, dict)]
        if isinstance(raw_crew, list):
            crew_rows = [r for r in raw_crew if isinstance(r, dict)]

    cast_rows.sort(key=_popularity, reverse=True)
    crew_rows.sort(key=_crew_row_rank)

    parsed: list[PersonTitleCard] = []
    seen_dept: set[tuple[str, int, str]] = set()

    def _consider(card: PersonTitleCard) -> None:
        key = _title_key(card)
        if key is None:
            return
        dept = (card.department or 'Crew').strip()
        dept_key = (key[0], key[1], dept)
        if dept_key in seen_dept:
            return
        seen_dept.add(dept_key)
        parsed.append(card)

    for row in crew_rows:
        card = _parse_credit_row(row, credit_kind='crew')
        if card is not None:
            _consider(card)
    for row in cast_rows:
        card = _parse_credit_row(row, credit_kind='cast')
        if card is not None:
            _consider(card)

    preferred = (
        known_for_department.strip() if isinstance(known_for_department, str) else ''
    )
    by_title: dict[tuple[str, int], list[PersonTitleCard]] = {}
    for card in parsed:
        key = _title_key(card)
        if key is None:
            continue
        by_title.setdefault(key, []).append(card)

    def _title_pop(cards: list[PersonTitleCard]) -> float:
        return max((c.popularity or 0.0) for c in cards)

    def _has_preferred(cards: list[PersonTitleCard]) -> bool:
        if not preferred:
            return False
        return any((c.department or '') == preferred for c in cards)

    title_keys = list(by_title.keys())
    title_keys.sort(
        key=lambda key: (
            0 if _has_preferred(by_title[key]) else 1,
            -_title_pop(by_title[key]),
        )
    )
    selected = title_keys[:MAX_FILMOGRAPHY]

    filmography: list[PersonTitleCard] = []
    for key in selected:
        group = by_title[key]
        group.sort(
            key=lambda card: (
                0 if (card.department or '') == preferred else 1,
                -(card.popularity or 0.0),
            )
        )
        filmography.extend(group)

    known_for = select_known_for(parsed, known_for_department=preferred or None)
    return known_for, filmography


def enrich_doc_from_tmdb_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Serialize a curated enrich section from a live TMDb person payload."""
    kfd = payload.get('known_for_department')
    known_for_department = kfd if isinstance(kfd, str) else None
    known_for, filmography = curate_combined_credits(
        payload.get('combined_credits'),
        known_for_department=known_for_department,
    )
    also_known_as = also_known_as_capped(payload.get('also_known_as'))
    socials = socials_from_external_ids(
        payload.get('external_ids')
        if isinstance(payload.get('external_ids'), dict)
        else None,
        homepage=payload.get('homepage')
        if isinstance(payload.get('homepage'), str)
        else None,
    )
    biography = payload.get('biography')
    birthday = payload.get('birthday')
    deathday = payload.get('deathday')
    place_of_birth = payload.get('place_of_birth')
    return {
        'biography': biography if isinstance(biography, str) else None,
        'birthday': birthday if isinstance(birthday, str) else None,
        'deathday': deathday if isinstance(deathday, str) else None,
        'place_of_birth': place_of_birth if isinstance(place_of_birth, str) else None,
        'known_for_department': (
            known_for_department if isinstance(known_for_department, str) else None
        ),
        'also_known_as': also_known_as,
        'socials': [s.model_dump(mode='json') for s in socials],
        'known_for': [c.model_dump(mode='json') for c in known_for],
        'filmography': [c.model_dump(mode='json') for c in filmography],
    }


def parse_date(value: date | str | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str) and len(value) >= 10:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def cards_from_cached(rows: list[Any] | None) -> list[PersonTitleCard]:
    if not rows:
        return []
    out: list[PersonTitleCard] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            out.append(PersonTitleCard.model_validate(row))
        except Exception:
            continue
    return out


def socials_from_cached(rows: list[Any] | None) -> list[PersonSocialLink]:
    if not rows:
        return []
    out: list[PersonSocialLink] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        kind = row.get('kind')
        label = row.get('label')
        url = row.get('url')
        if (
            not isinstance(kind, str)
            or not isinstance(label, str)
            or not isinstance(url, str)
        ):
            continue
        # Re-validate allowlist on cache read (reject poisoned entries).
        if kind == 'homepage':
            link = homepage_social(url)
        else:
            link = social_link_from_parts(kind=kind, label=label, url=url)
        if link is not None:
            out.append(link)
    return out


def pg_fallback_enrich_fields(person: Person) -> dict[str, Any]:
    """Build enrich-shaped fields from Postgres only (no TMDb)."""
    cards = cards_from_pg_credits(list(person.credits or []))
    # Prefer popularity-ish order: billing_order then title.
    cards.sort(
        key=lambda c: (
            0 if c.credit_kind == 'cast' else 1,
            (c.title or '').lower(),
        )
    )
    known_for = select_known_for(cards, known_for_department=None)
    return {
        'biography': person.biography,
        'birthday': person.birthday.isoformat() if person.birthday else None,
        'deathday': person.deathday.isoformat() if person.deathday else None,
        'place_of_birth': person.place_of_birth,
        'known_for_department': None,
        'also_known_as': [],
        'socials': [],
        'known_for': [c.model_dump(mode='json') for c in known_for],
        'filmography': [c.model_dump(mode='json') for c in cards],
    }
