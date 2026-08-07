"""Normalize TMDB detail enrichment into a compact JSONB document.

Option B (lean catalog): Postgres persists **no** title-chrome extras
(``lean_extras_for_persist`` → ``{}``). Identity/shelf fields live on
``content_items`` / subtype columns. Tagline, genres, providers, similar,
and other chrome are Redis ↔ TMDb enrichment at read time.
"""

from __future__ import annotations

from typing import Any

_MAX_GENRES = 12
_MAX_KEYWORDS = 16
_MAX_ALT_TITLES = 12
_MAX_VIDEOS = 12
_MAX_BACKDROPS = 24
_MAX_POSTERS = 12
_MAX_RELEASE_ROWS = 24
_MAX_STUDIOS = 16
_MAX_NETWORKS = 12
_MAX_SIMILAR = 6

_VIDEO_TYPE_RANK = {
    'Trailer': 0,
    'Teaser': 1,
    'Clip': 2,
    'Featurette': 3,
}

# Postgres ``content_items.extras`` stays empty under Option B.
LEAN_EXTRAS_KEYS: frozenset[str] = frozenset()

# Filled at detail-read time via Redis section cache ↔ TMDb.
ENRICHMENT_EXTRAS_KEYS: frozenset[str] = frozenset(
    {
        'tagline',
        'original_language',
        'budget',
        'revenue',
        'collection',
        'genres',
        'keywords',
        'studios',
        'networks',
        'episode_runtime_minutes',
        'countries',
        'spoken_languages',
        'alternative_titles',
        'releases',
        'watch_providers',
        'videos',
        'images',
        'similar',
        'tmdb_vote_average',
        'tmdb_vote_count',
    }
)


def _tmdb_vote_average(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    average = float(value)
    if average < 0 or average > 10:
        return None
    return average


def _tmdb_vote_count(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    count = int(value)
    if count < 0:
        return None
    return count


def lean_extras_for_persist(_extras: dict[str, Any] | None) -> dict[str, Any]:
    """Return the durable extras projection (always empty under Option B)."""
    return {}


def extras_need_live_enrichment(extras: dict[str, Any] | None) -> bool:
    """True when extras lack enough chrome for a useful detail page.

    Also true when TMDB vote fields are missing so hybrid title ratings can
    resolve (legacy fat Postgres rows often have genres/tagline but no votes).
    """
    if not isinstance(extras, dict) or not extras:
        return True
    providers = extras.get('watch_providers')
    similar = extras.get('similar')
    genres = extras.get('genres')
    tagline = extras.get('tagline')
    has_providers = isinstance(providers, dict) and bool(providers)
    has_similar = isinstance(similar, list) and bool(similar)
    has_genres = isinstance(genres, list) and bool(genres)
    has_tagline = isinstance(tagline, str) and bool(tagline.strip())
    has_chrome = has_providers or has_similar or has_genres or has_tagline
    has_votes = isinstance(extras.get('tmdb_vote_average'), (int, float)) and isinstance(
        extras.get('tmdb_vote_count'),
        (int, float),
    )
    return not (has_chrome and has_votes)


def merge_enrichment_extras(
    base: dict[str, Any] | None,
    overlay: dict[str, Any] | None,
) -> dict[str, Any]:
    """Overlay enrichment keys onto a base extras document."""
    out: dict[str, Any] = dict(base) if isinstance(base, dict) else {}
    if not isinstance(overlay, dict):
        return out
    for key in ENRICHMENT_EXTRAS_KEYS:
        if key not in overlay:
            continue
        value = overlay[key]
        if value is None:
            continue
        if key == 'watch_providers' and isinstance(value, dict):
            if value:
                out[key] = value
            continue
        if key == 'similar' and isinstance(value, list):
            if value:
                out[key] = value
            continue
        if key in (
            'genres',
            'keywords',
            'studios',
            'networks',
            'countries',
            'spoken_languages',
            'alternative_titles',
            'releases',
            'videos',
        ):
            if isinstance(value, list) and value:
                out[key] = value
            continue
        if key == 'images' and isinstance(value, dict):
            out[key] = value
            continue
        if key == 'episode_runtime_minutes' and isinstance(value, (int, float)):
            if int(value) > 0:
                out[key] = int(value)
            continue
        if key in ('tagline', 'original_language') and isinstance(value, str):
            if value.strip():
                out[key] = value
            continue
        if key in ('budget', 'revenue') and isinstance(value, (int, float)):
            if value:
                out[key] = value
            continue
        if key == 'collection' and isinstance(value, dict) and value.get('name'):
            out[key] = value
            continue
        if key == 'tmdb_vote_average' and isinstance(value, (int, float)):
            out[key] = float(value)
            continue
        if key == 'tmdb_vote_count' and isinstance(value, (int, float)):
            out[key] = int(value)
            continue
    return out


def _as_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _as_dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def build_extras_from_tmdb_payload(
    payload: dict[str, Any],
    *,
    kind: str,
) -> dict[str, Any]:
    """Curate a stable extras document from a TMDB movie/TV detail payload."""
    genres = [
        {'id': g.get('id'), 'name': g.get('name')}
        for g in _as_list(payload.get('genres'))
        if isinstance(g, dict) and g.get('name')
    ][:_MAX_GENRES]

    keyword_block = _as_dict(payload.get('keywords'))
    keyword_rows = _as_list(
        keyword_block.get('keywords')
        if kind == 'movie'
        else keyword_block.get('results')
    )
    keywords = [
        {'id': k.get('id'), 'name': k.get('name')}
        for k in keyword_rows
        if isinstance(k, dict) and k.get('name')
    ][:_MAX_KEYWORDS]

    studios = [
        {
            'id': c.get('id'),
            'name': c.get('name'),
            'origin_country': c.get('origin_country') or None,
        }
        for c in _as_list(payload.get('production_companies'))
        if isinstance(c, dict) and c.get('name')
    ][:_MAX_STUDIOS]
    networks = [
        {
            'id': n.get('id'),
            'name': n.get('name'),
            'origin_country': n.get('origin_country') or None,
        }
        for n in _as_list(payload.get('networks'))
        if isinstance(n, dict) and n.get('name')
    ][:_MAX_NETWORKS]
    episode_runtime_minutes: int | None = None
    runtimes = [
        int(value)
        for value in _as_list(payload.get('episode_run_time'))
        if isinstance(value, (int, float)) and int(value) > 0
    ]
    if runtimes:
        episode_runtime_minutes = runtimes[0]
    countries = [
        {
            'iso_3166_1': c.get('iso_3166_1'),
            'name': c.get('name'),
        }
        for c in _as_list(payload.get('production_countries'))
        if isinstance(c, dict) and c.get('iso_3166_1')
    ]
    spoken_languages = [
        {
            'iso_639_1': lang.get('iso_639_1'),
            'english_name': lang.get('english_name') or lang.get('name'),
            'name': lang.get('name'),
        }
        for lang in _as_list(payload.get('spoken_languages'))
        if isinstance(lang, dict) and (lang.get('english_name') or lang.get('name'))
    ]

    alt_block = _as_dict(payload.get('alternative_titles'))
    alt_rows = _as_list(
        alt_block.get('titles') if kind == 'movie' else alt_block.get('results')
    )
    alternative_titles = [
        {
            'iso_3166_1': row.get('iso_3166_1'),
            'title': row.get('title'),
            'type': row.get('type') or None,
        }
        for row in alt_rows
        if isinstance(row, dict) and row.get('title')
    ][:_MAX_ALT_TITLES]

    releases: list[dict[str, Any]] = []
    if kind == 'movie':
        for country in _as_list(_as_dict(payload.get('release_dates')).get('results')):
            if not isinstance(country, dict):
                continue
            code = country.get('iso_3166_1')
            for rel in _as_list(country.get('release_dates')):
                if not isinstance(rel, dict) or not rel.get('release_date'):
                    continue
                releases.append(
                    {
                        'country': code,
                        'release_date': str(rel.get('release_date'))[:10],
                        'type': rel.get('type'),
                        'certification': rel.get('certification') or None,
                        'note': (rel.get('note') or None) or None,
                    }
                )
                if len(releases) >= _MAX_RELEASE_ROWS:
                    break
            if len(releases) >= _MAX_RELEASE_ROWS:
                break
    else:
        for row in _as_list(_as_dict(payload.get('content_ratings')).get('results')):
            if not isinstance(row, dict) or not row.get('iso_3166_1'):
                continue
            releases.append(
                {
                    'country': row.get('iso_3166_1'),
                    'release_date': None,
                    'type': None,
                    'certification': row.get('rating') or None,
                    'note': None,
                }
            )
            if len(releases) >= _MAX_RELEASE_ROWS:
                break

    video_rows = [
        v
        for v in _as_list(_as_dict(payload.get('videos')).get('results'))
        if isinstance(v, dict)
        and v.get('site') == 'YouTube'
        and v.get('key')
        and v.get('type') in _VIDEO_TYPE_RANK
    ]
    video_rows.sort(
        key=lambda v: (
            _VIDEO_TYPE_RANK.get(str(v.get('type')), 9),
            0 if v.get('official') else 1,
            str(v.get('published_at') or ''),
        )
    )
    videos = [
        {
            'key': v.get('key'),
            'name': v.get('name'),
            'site': 'YouTube',
            'type': v.get('type'),
            'official': bool(v.get('official')),
        }
        for v in video_rows[:_MAX_VIDEOS]
    ]

    images_block = _as_dict(payload.get('images'))
    backdrops = [
        b.get('file_path')
        for b in _as_list(images_block.get('backdrops'))
        if isinstance(b, dict) and b.get('file_path')
    ][:_MAX_BACKDROPS]
    posters = [
        p.get('file_path')
        for p in _as_list(images_block.get('posters'))
        if isinstance(p, dict) and p.get('file_path')
    ][:_MAX_POSTERS]

    providers_out: dict[str, Any] = {}
    provider_results = _as_dict(_as_dict(payload.get('watch/providers')).get('results'))
    for region, block in provider_results.items():
        if not isinstance(block, dict):
            continue
        region_out: dict[str, Any] = {}
        if block.get('link'):
            region_out['link'] = block.get('link')
        for bucket in ('flatrate', 'rent', 'buy', 'ads', 'free'):
            rows = []
            for provider in _as_list(block.get(bucket)):
                if not isinstance(provider, dict) or not provider.get('provider_name'):
                    continue
                rows.append(
                    {
                        'provider_id': provider.get('provider_id'),
                        'provider_name': provider.get('provider_name'),
                        'logo_path': provider.get('logo_path'),
                        'display_priority': provider.get('display_priority'),
                    }
                )
            if rows:
                region_out[bucket] = rows
        if len(region_out) > (1 if 'link' in region_out else 0):
            providers_out[str(region)] = region_out

    collection = payload.get('belongs_to_collection')
    collection_out = None
    if isinstance(collection, dict) and collection.get('name'):
        collection_out = {
            'id': collection.get('id'),
            'name': collection.get('name'),
            'poster_path': collection.get('poster_path'),
        }

    similar: list[dict[str, Any]] = []
    for row in _as_list(_as_dict(payload.get('recommendations')).get('results')):
        if not isinstance(row, dict) or not row.get('id'):
            continue
        title = row.get('title') or row.get('name')
        if not title:
            continue
        date_value = row.get('release_date') or row.get('first_air_date') or ''
        year = None
        if (
            isinstance(date_value, str)
            and len(date_value) >= 4
            and date_value[:4].isdigit()
        ):
            year = int(date_value[:4])
        similar.append(
            {
                'tmdb_id': row.get('id'),
                'title': title,
                'year': year,
                'poster_path': row.get('poster_path'),
            }
        )
        if len(similar) >= _MAX_SIMILAR:
            break

    return {
        'tagline': payload.get('tagline') or None,
        'original_language': payload.get('original_language') or None,
        'budget': payload.get('budget') or None,
        'revenue': payload.get('revenue') or None,
        'collection': collection_out,
        'genres': genres,
        'keywords': keywords,
        'studios': studios,
        'networks': networks if kind == 'tv' else [],
        'episode_runtime_minutes': (episode_runtime_minutes if kind == 'tv' else None),
        'countries': countries,
        'spoken_languages': spoken_languages,
        'alternative_titles': alternative_titles,
        'releases': releases,
        'videos': videos,
        'images': {'backdrops': backdrops, 'posters': posters},
        'watch_providers': providers_out,
        'similar': similar,
        'tmdb_vote_average': _tmdb_vote_average(payload.get('vote_average')),
        'tmdb_vote_count': _tmdb_vote_count(payload.get('vote_count')),
    }
