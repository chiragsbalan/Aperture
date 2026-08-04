# ADR-0008 — Personal library (lists + diary)

- **Status:** Accepted
- **Date:** 2026-08-02
- **Related:** Lists LLD; Database Design (lists domain); [ADR-0004](ADR-0004-content-identity.md) (content refs + home rails); [ADR-0005](ADR-0005-auth.md) (AuthZ); [ADR-0009](ADR-0009-public-profiles.md) (public shelves); PLAN.md P3; profile-complete `pc.2`
- **Implements in:** P3.1 (watchlist), P3.2 (favorites), P3.3 (custom lists), P3.4 (diary / `watch_entries`) — shipped as `v0.4.0`
- **Amended:** 2026-08-05 (pc.2) — fixed system-list visibility; binary custom visibility; newest-added-first order (no reorder); optional diary half-star `rating`; `GET /me/watch-entries/contains`; username-scoped public shelf APIs

## Context

Phase 3 ships a personal library on the public product. Watchlist and favorites are **unique per user** (Lists LLD), must reference **Aperture** titles only (ADR-0004), and must never accept raw TMDb ids. Detail DTOs emit `type: "tv_show"` while search already exposes public `tv`, so polymorphic list APIs need an explicit type contract. Diary / watch history is a separate concept (many events per title) and must not be modeled as `list_items`.

pc.2 makes watchlist always public on the profile, favorites always private, and custom lists `public|private` only.

## Decision

### Storage — lists

- Own tables **`lists`** and **`list_items`** in the Lists domain (`backend/app/lists/`).
- **`lists.kind`:** `watchlist` | `favorites` | `custom`.
- **System uniqueness:** partial unique index on `(owner_user_id, kind)` **WHERE** `kind IN ('watchlist','favorites')`.
- **Owner:** `owner_user_id` → `users.id` (Users profile), resolved from the authenticated Auth identity.
- **Items:** `(list_id, content_type, content_id)` with **UNIQUE** membership per list; `position` kept for append/compact bookkeeping; **display order** is `created_at DESC` (newest added first) for watchlist, favorites, and custom lists.
- Persist **`content_type`** as `content_items` values: `movie` | `tv_show`. Existence is validated in the Lists **service** via Metadata service (no TMDb client; no Metadata repository imports from Lists).
- Soft-delete is **not** used: custom lists are **hard-deleted** (FK cascade on `list_items`). System lists are never deleted by users.
- **Visibility CHECKs (pc.2):** `visibility IN ('private','public')`; `(kind <> 'watchlist') OR (visibility = 'public')`; `(kind <> 'favorites') OR (visibility = 'private')`. Migrations: `e1f2a3b4c5d6` (system fixed visibility; briefly re-allowed `unlisted` on customs) then `f2a3b4c5d6e7` (coerce `unlisted` → `private`, restore binary CHECK, add diary rating).

### Storage — diary

- Table **`watch_entries`** in sibling package `backend/app/library/` (not `list_items`).
- Columns: `owner_user_id`, `content_type` / `content_id`, `watched_at` (**DATE**), optional `note` (≤ 1000), optional `rating` (`Numeric(2,1)`, null or 0.5–5.0 half-star steps), timestamps.
- Indexes: `(owner_user_id, watched_at DESC, created_at DESC)` and `(owner_user_id, content_type, content_id)`.
- **No UNIQUE** on content — rewatches are additional rows.
- import-linter: `library` is a sibling of `lists` — **no** lists↔library imports. Shared content-ref helpers live in `app.common.content_refs`.

### Public API content refs

| Public `type` | Accepted aliases on input | Stored `content_type` |
|---|---|---|
| `movie` | — | `movie` |
| `tv` | `tv_show` | `tv_show` |

- Responses always emit **`movie` | `tv`**.
- **`person`** (and other types) → **422**.
- Unknown Aperture title id → **404**.
- System list add/remove: **idempotent** (200 if already present; 204 if already absent).

### HTTP surface

**System lists (P3.1 / P3.2)** — authenticated `/api/v1/me/watchlist` and `/me/favorites` (page, add/remove, batch `contains`). Lazy-created on first **owner** `/me/...` access. No `PATCH` visibility routes (pc.2).

**Custom lists (P3.3)**

| Method | Path | Auth |
|---|---|---|
| GET/POST | `/api/v1/me/lists` | required |
| GET | `/api/v1/me/lists/membership?type=&id=` | required (batch for Add to list) |
| GET | `/api/v1/lists/{id}` (+ `/items`) | optional Bearer; public IP rate limit |
| PATCH/DELETE | `/api/v1/lists/{id}` | required owner |
| POST | `/api/v1/lists/{id}/items` | required owner |
| DELETE | `/api/v1/lists/{id}/items/{item_id}` | required owner |
| GET | `/api/v1/lists/{id}/contains` | required owner |

- **Create default:** `POST /me/lists` defaults `visibility` to **`public`** unless the client sends `private`.
- **Removed (pc.2):** `PUT /lists/{id}/items/reorder`; `PATCH /me/watchlist`; `PATCH /me/favorites`.

**Public profile shelves (pc.2)** — see also [ADR-0009](ADR-0009-public-profiles.md):

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/users/{username}/watchlist` | none | Always public; empty page if no row (**no** lazy-create); soft-deleted → 404 |
| GET | `/api/v1/users/{username}/lists` | optional Bearer | Custom lists only; owners see all; visitors see `public` only |

These username routes share the **`users_public`** IP rate-limit bucket with profile/diary GETs. Public by-id custom list GETs (`/lists/{id}`, `/items`) use the **same** bucket.

**Diary (P3.4 / pc.2)** — authenticated `/api/v1/me/watch-entries` (GET/POST/PATCH/DELETE). Logging a watch **always** removes that title from the owner’s watchlist (API-layer orchestration: flush-only diary create + watchlist remove, then **one** `session.commit()`; never remove-before-create).

- **Contains:** `GET /api/v1/me/watch-entries/contains?ids=type:uuid` — owner-only batch membership for title Log toggles. Rate-limited under a **separate** Redis key namespace (`library:rl:contains:{identity}` — must not share `lists:rl:write`). Unsupported content types return `membership[key]=false` (not omitted); malformed tokens → **422**.
- **Rating HTTP:** create/PATCH accept optional half-star `rating` (`0.5`–`5.0`); responses include `rating` (null when unset). Clear via PATCH `rating: null`. Public diary GETs return the same `rating` field (diary is always public ⇒ ratings are public).

### AuthZ / visibility

**pc.2:** custom lists use **`private` | `public`** only (UI: Private / Anyone). System lists have fixed visibility (DB CHECK): **watchlist always `public`**, **favorites always `private`**. Any remaining `unlisted` rows are coerced to `private`. There is no link-only middle state.

| Case | Behavior |
|---|---|
| Private custom list, non-owner or anon | **404** (no existence leak) |
| Public custom list | Readable by id; appears on profile Lists index |
| System kinds via `/lists/{id}*` mutate/contains/GET | **404** (`require_custom_list_mutable` / custom-only read surface) |
| Watchlist | Always public; profile tab + `GET /users/{username}/watchlist`; empty OK; never deleted; no visibility PATCH |
| Favorites | Always private; owner `/me/favorites` / `/library/favorites` only; no public route; no visibility PATCH |
| Soft-deleted owner | Username routes + by-id custom list metadata/items → **404** |
| Shareable list DTO | `is_owner` boolean; `owner_user_id` only for owner (null for others) |
| Diary | **Always public** on profile. Public read: `GET /api/v1/users/{username}/watch-entries` (see [ADR-0009](ADR-0009-public-profiles.md)). Owner mutate/list: `/api/v1/me/watch-entries` |
| Diary PATCH/DELETE other user’s entry | **404** |

### Item order

**Newest-added-first** (`created_at DESC`, then `id DESC`). No manual reorder endpoint or UI. Item delete may still compact-renumber `position` under `lock_list` for bookkeeping; clients must not sort by `position` for display.

### Caps (P3 MVP)

Title ≤ 100; description ≤ 2000; ≤ **500** items/list; ≤ **50** custom lists/user (count under FOR UPDATE of owner’s custom rows); diary note ≤ 1000; write rate limits keyed by identity via `CacheBackend`.

### What is not a list

- Diary / `watch_entries` (multi-event history).
- **“Completed”** as a system kind — not a PLAN ship gate; defer or use a custom list.

## Alternatives considered

1. **Separate `watchlist_items` / `favorite_items` tables** — rejected; one lists domain with `kind`.
2. **Public API type `tv_show` only** — rejected; accept `tv_show` as input alias; emit `tv`.
3. **Store public `tv` in DB** — rejected; persist `content_items` types.
4. **Diary rows in `list_items`** — rejected; rewatches need multi-row history.
5. **Manual reorder / fractional positions** — removed; addition time is the only order.
6. **library → lists import for watchlist clear-on-log** — rejected; API-layer orchestration preserves sibling isolation.
7. **Create system lists at registration only** — rejected; lazy-create on first `/me/...` access.
8. **Link-only / `unlisted` custom lists** — removed in pc.2; binary visibility only.
9. **Separate ADR-0010 for diary half-stars** — rejected for per-entry diary ratings; those live here. Reserve ADR-0010 for a distinct title-level ratings product if needed.

## Consequences

- Frontend routes: `/library/watchlist`, `/library/favorites`, `/library/lists`, `/lists/[id]`, `/library/diary`; public `/u/{username}/watchlist` and `/u/{username}/lists`; detail actions for watchlist, favorites, Add to list, Log watch.
- Per-entry diary half-stars are **library/diary domain** (this ADR / pc.2), not a future ratings ADR.
- OpenSearch hosting remains **ADR-0007** at P5 exit — this ADR does not consume that number.
- Phase exit tag: **`v0.4.0`**; pc.2 release note: `docs/releases/pc.2-public-library.md`.

## Future evolution

- Optional FK from `list_items.content_id` → `content_items.id` if orphan cleanup becomes painful.
- Public list discovery / trending; episode-level diary; Letterboxd import.
- Batched title library-status API (watchlist/favorites/logged/membership in one call) — tracked as a performance follow-up, not a visibility change.
