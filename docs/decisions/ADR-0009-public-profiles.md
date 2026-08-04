# ADR-0009 — Public profiles (shell + library surfaces)

- **Status:** Accepted
- **Date:** 2026-08-03
- **Related:** [ADR-0005](ADR-0005-auth.md) (Users profile ownership); [ADR-0008](ADR-0008-personal-library-lists.md) (list visibility + diary AuthZ); profile-complete track `pc.1`–`pc.8`
- **Implements in:** `pc.1` Profile shell + public diary wall; later slices add films/reviews/follows/activity/stats under `/u/{username}/…`

## Context

P1.4 shipped a minimal public profile (`GET /users/{username}` → username / display_name / bio). The product needs a Letterboxd-depth public profile while keeping Aperture’s modular monolith boundaries (Users must not import Lists/Library). Profiles themselves are always public; individual shelves (watchlist, favorites, custom lists) may be private.

## Decision

### Profile identity

- Profiles are **always public** when the user exists and is not soft-deleted (`deleted_at IS NULL`).
- Soft-deleted usernames return **404** on all public profile routes. Usernames remain reserved until hard delete / admin reclaim.
- Shell fields (Users-owned): `username`, `display_name`, `bio`, optional `avatar_url` / `website_url` (HTTPS only), `links` JSONB (≤3 `{label,url}`).
- No avatar file upload in this track — HTTPS URL string only.

### API shape

- `GET /api/v1/users/{username}` returns shell + `is_owner` + `counts` (`movies`, `shows`, `followers`, `following`).
- **Counters assembled in `app.api`** (orchestrating Library for distinct logged titles). Users domain never imports Lists/Library.
- `movies` / `shows` = distinct diary titles by type; social counts stub to 0 until follows ship.
- `GET /api/v1/users/{username}/watch-entries` — **always public** diary page (no auth, no visibility gate). Soft-deleted / missing username → **404**. Owner mutate/list remains on `/api/v1/me/watch-entries` (see [ADR-0008](ADR-0008-personal-library-lists.md)).
- Public profile + diary GETs share an IP rate-limit bucket (`users_public_rate_limit_*`, CacheBackend / Redis when available) via trusted client IP — same pattern as search.

### Frontend

- Routes under `/u/[username]` with layout shell + ProfileNav tabs: **Diary** (index / wall), **Watchlist**, **Lists**, **Activity**, **Reviews**.
- **pc.1 owns the public diary wall** (`ProfileDiary` on the profile index): read-only paginated entries with client page + accumulated-view caches (`PUBLIC_DIARY_TTL_MS`), clear-all invalidation on diary mutations and on logout.
- **pc.2** adds always-public **Watchlist** tab (`/u/{username}/watchlist`, `GET /users/{username}/watchlist`), **Lists** tab of custom lists only (`GET /users/{username}/lists` — owners see all; visitors see public), and custom-list **public|private** visibility. Favorites are never on the public profile. Activity/Reviews remain stubs until later slices.
- Standalone Movies / Shows collection pages (`/u/{username}/movies|shows`) derive unique titles from the **public** diary for every viewer (not owner-only). Followers/following stay stubs until follows ship.
- Account menu: header opens `/u/{username}`; nav is Library + Settings only. Owner Library (`/library/*`) is private workspace only.
- Owner “Edit profile” → `/settings` (avatar/website/links). Avatar **display** is initials-only until upload/CDN + CSP; URL field may remain for later.

## Alternatives considered

1. **Monolithic profile DTO with embedded shelves** — rejected; tab payloads stay domain-owned for pagination and AuthZ.
2. **Counters inside Users service** — rejected; breaks import-linter (Users ↛ Lists/Library).
3. **Profile-level privacy** — rejected; product lock is always-public profiles.

## Consequences

- **pc.1** ships the public diary wall and public Movies/Shows shelves derived from it.
- **pc.2** ships public Lists + always-public watchlist; favorites stay private; Activity verbs are documented for pc.7 (no emit in pc.2).
- Client diary caches are best-effort: TTL expiry plus clear-all on mutate/logout; logout-only clear is not a hard security boundary for previously viewed public pages.
- Aggressive diary pagination (e.g. Movies/Shows scraping many pages) shares the public IP budget with profile shell GETs — tune `USERS_PUBLIC_RATE_LIMIT_MAX_PER_IP` if legitimate browsing hits 429.
- Diary half-star ratings on public walls are **[ADR-0008](ADR-0008-personal-library-lists.md) / pc.2** (optional `watch_entries.rating`), not ADR-0010.
- ADRs 0010–0013 cover dedicated ratings product, reviews, follows, activity.

## Future evolution

- Avatar upload / CDN; location field; richer link types.
