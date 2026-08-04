# ADR-0008 — Personal library (lists + diary)

- **Status:** Accepted
- **Date:** 2026-08-02
- **Related:** Lists LLD; Database Design (lists domain); [ADR-0004](ADR-0004-content-identity.md) (content refs); [ADR-0005](ADR-0005-auth.md) (AuthZ); PLAN.md P3; `phases/p3/work-breakdown.md`
- **Implements in:** P3.1 (watchlist), P3.2 (favorites), P3.3 (custom lists), P3.4 (diary / `watch_entries`) — shipped as `v0.4.0`
- **Amended:** 2026-08-05 — item order is newest-added-first; manual reorder removed; optional diary `rating` (half-stars 0.5–5.0)

## Context

Phase 3 ships a personal library on the public product. Watchlist and favorites are **unique per user** (Lists LLD), must reference **Aperture** titles only (ADR-0004), and must never accept raw TMDb ids. Detail DTOs emit `type: "tv_show"` while search already exposes public `tv`, so polymorphic list APIs need an explicit type contract. Diary / watch history is a separate concept (many events per title) and must not be modeled as `list_items`.

## Decision

### Storage — lists

- Own tables **`lists`** and **`list_items`** in the Lists domain (`backend/app/lists/`).
- **`lists.kind`:** `watchlist` | `favorites` | `custom`.
- **System uniqueness:** partial unique index on `(owner_user_id, kind)` **WHERE** `kind IN ('watchlist','favorites')`.
- **Owner:** `owner_user_id` → `users.id` (Users profile), resolved from the authenticated Auth identity.
- **Items:** `(list_id, content_type, content_id)` with **UNIQUE** membership per list; `position` kept for append/compact bookkeeping; **display order** is `created_at DESC` (newest added first) for watchlist, favorites, and custom lists.
- Persist **`content_type`** as `content_items` values: `movie` | `tv_show`. Existence is validated in the Lists **service** via Metadata service (no TMDb client; no Metadata repository imports from Lists).
- Soft-delete is **not** used: custom lists are **hard-deleted** (FK cascade on `list_items`). System lists are never deleted by users.

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

**System lists (P3.1 / P3.2)** — authenticated `/api/v1/me/watchlist` and `/me/favorites` (page, add/remove, batch `contains`). Lazy-created on first access.

**Custom lists (P3.3)**

| Method | Path | Auth |
|---|---|---|
| GET/POST | `/api/v1/me/lists` | required |
| GET | `/api/v1/me/lists/membership?type=&id=` | required (batch for Add to list) |
| GET | `/api/v1/lists/{id}` (+ `/items`) | optional Bearer |
| PATCH/DELETE | `/api/v1/lists/{id}` | required owner |
| POST | `/api/v1/lists/{id}/items` | required owner |
| DELETE | `/api/v1/lists/{id}/items/{item_id}` | required owner |
| GET | `/api/v1/lists/{id}/contains` | required owner |

**Diary (P3.4)** — authenticated `/api/v1/me/watch-entries` (GET/POST/PATCH/DELETE). Logging a watch **always** removes that title from the owner’s watchlist (API-layer orchestration: flush-only diary create + watchlist remove, then **one** `session.commit()`; never remove-before-create).

- **Contains:** `GET /api/v1/me/watch-entries/contains?ids=type:uuid` — batch membership for title Log toggles (rate-limited under `library:rl:contains:{identity}`; unsupported types return `false`, not omitted).
- **Rating HTTP:** create/PATCH accept optional half-star `rating` (`0.5`–`5.0`); responses include `rating` (null when unset). Clear via PATCH `rating: null`.

### AuthZ / visibility

**Amended pc.2:** custom lists use **`private` | `public`** only (UI: Private / Anyone). System lists have fixed visibility (DB CHECK): **watchlist always `public`**, **favorites always `private`**. Any remaining `unlisted` rows are coerced to `private`. There is no link-only middle state.

| Case | Behavior |
|---|---|
| Private custom list, non-owner or anon | **404** (no existence leak) |
| Public custom list | Readable by id; appears on profile Lists index |
| System kinds via `/lists/{id}*` mutate/contains/GET | **404** (`require_custom_list_mutable` / custom-only read surface) |
| Watchlist | Always public; own profile tab + `GET /users/{username}/watchlist`; empty OK; never deleted; no visibility PATCH |
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

## Consequences

- Frontend routes: `/library/watchlist`, `/library/favorites`, `/library/lists`, `/lists/[id]`, `/library/diary`; detail actions for watchlist, favorites, Add to list, Log watch.
- OpenSearch hosting remains **ADR-0007** at P5 exit — this ADR does not consume that number.
- Phase exit tag: **`v0.4.0`**.

## Future evolution

- Optional FK from `list_items.content_id` → `content_items.id` if orphan cleanup becomes painful.
- Public list discovery / trending; episode-level diary; Letterboxd import.
