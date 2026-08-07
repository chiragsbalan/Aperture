# ADR-0009 — Public profiles (shell + library surfaces)

- **Status:** Accepted
- **Date:** 2026-08-03
- **Related:** [ADR-0005](ADR-0005-auth.md) (Users profile ownership); [ADR-0008](ADR-0008-personal-library-lists.md) (list visibility + diary AuthZ); profile-complete track `pc.1`–`pc.8`
- **Implements in:** `pc.1` Profile shell + public diary wall; `pc.2` public Watchlist + Lists tabs; later slices add reviews/follows/activity/stats under `/u/{username}/…`
- **Amended:** 2026-08-05 (pc.2) — Watchlist/Lists nav; fixed system visibility; diary ratings cross-ref; shared public IP rate-limit bucket

## Context

P1.4 shipped a minimal public profile (`GET /users/{username}` → username / display_name / bio). The product needs a Letterboxd-depth public profile while keeping Aperture’s modular monolith boundaries (Users must not import Lists/Library). Profiles themselves are always public. **Custom lists** may be private; **watchlist is always public** and **favorites are always private** (pc.2 / ADR-0008).

## Decision

### Profile identity

- Profiles are **always public** when the user exists and is not soft-deleted (`deleted_at IS NULL`).
- Soft-deleted usernames return **404** on all public profile routes. Usernames remain reserved until hard delete / admin reclaim.
- Shell fields (Users-owned): `username`, `display_name`, `bio`, optional `avatar_url` / `website_url` (HTTPS only), `links` JSONB (≤3 `{label,url}`).
- No avatar file upload in this track — HTTPS URL string only.

### API shape

- `GET /api/v1/users/{username}` returns shell + `is_owner` + `counts` (`movies`, `shows`, `followers`, `following`).
- **Counters assembled in `app.api`** (orchestrating Library for distinct logged titles). Users domain never imports Lists/Library.
- `movies` / `shows` = distinct diary titles by type; **followers / following stub to 0** until follows ship (pc.6). UI must not show fabricated demo people.
- `GET /api/v1/users/{username}/watch-entries` — **always public** diary page (includes optional `rating` / `note`). Soft-deleted / missing username → **404**. Owner mutate/list remains on `/api/v1/me/watch-entries` (see [ADR-0008](ADR-0008-personal-library-lists.md)).
- `GET /api/v1/users/{username}/watchlist` — always-public watchlist page; empty when no system row exists (**no** lazy-create on public read).
- `GET /api/v1/users/{username}/lists` — custom-list index only (owners see all; visitors see `public`).
- **Public IP rate-limit bucket** (`users_public_rate_limit_*`, CacheBackend / Redis when available) covers: profile shell, public diary, public watchlist, public lists index, **and** public by-id custom list GETs (`GET /lists/{id}`, `/items`). Trusted client IP — same pattern as search.

### Frontend

- Routes under `/u/[username]` with layout shell + ProfileNav tabs: **Diary** (index / wall), **Watchlist**, **Lists**, **Activity**, **Reviews**.
- **pc.1** owns the public diary wall (`ProfileDiary` on the profile index): paginated entries with client page + accumulated-view caches (`PUBLIC_DIARY_TTL_MS`), clear-all invalidation on diary mutations and on logout. Owner edit/delete uses shell `is_owner` context (no duplicate profile GET).
- **pc.2** adds always-public **Watchlist** tab (`/u/{username}/watchlist`) and **Lists** tab (`/u/{username}/lists`). Favorites are never on the public profile (owner-only `/library/favorites`). Activity/Reviews remain stubs until later slices.
- Standalone Movies / Shows collection pages (`/u/{username}/movies|shows`) derive unique titles from the **public** diary for every viewer. Followers/following counters show API zeros until pc.6; sheets stay empty (no demo fixtures).
- Account menu: header opens `/u/{username}`; nav is Library + Settings only. Owner Library (`/library/*`) is private workspace only.
- Owner “Edit profile” → `/settings` (avatar/website/links). Avatar upload/CDN is **[ADR-0014](ADR-0014-avatar-r2-cdn.md)** (R2 + custom domain); until R2 is configured, upload returns 503 and UI stays initials-only.
- Profile tab content may mount while the shell header is still loading so tab fetches overlap the profile GET.

## Alternatives considered

1. **Monolithic profile DTO with embedded shelves** — rejected; tab payloads stay domain-owned for pagination and AuthZ.
2. **Counters inside Users service** — rejected; breaks import-linter (Users ↛ Lists/Library).
3. **Profile-level privacy** — rejected; product lock is always-public profiles.
4. **Demo followers/following in production UI** — rejected; show real counts (0 until pc.6) only.

## Consequences

- **pc.1** ships the public diary wall and public Movies/Shows shelves derived from it.
- **pc.2** ships public Lists + always-public watchlist; favorites stay private; Activity verbs are reserved for pc.7 (no emit in pc.2).
- Client diary caches are best-effort: TTL expiry plus clear-all on mutate/logout; logout-only clear is not a hard security boundary for previously viewed public pages.
- Aggressive diary/list pagination shares the public IP budget — tune `USERS_PUBLIC_RATE_LIMIT_MAX_PER_IP` if legitimate browsing hits 429.
- Diary half-star ratings on public walls are **[ADR-0008](ADR-0008-personal-library-lists.md) / pc.2** (optional `watch_entries.rating`), not a separate ratings ADR.
- **ADR numbering note:** [ADR-0010](ADR-0010-guest-landing-home-shell.md) is guest/signed-in home shell; [ADR-0011](ADR-0011-title-poster-morph.md) / [ADR-0012](ADR-0012-brand-shell-atmosphere.md) are UI morph/atmosphere. Later profile slices (reviews, follows, activity, title-level ratings if any) take the **next free** ADR ids after 0012 — not the old “0010–0013” reservation.

## Future evolution

- Location field; richer link types. (Avatar upload / CDN → [ADR-0014](ADR-0014-avatar-r2-cdn.md).)
- Real followers/following APIs and counters (pc.6).
