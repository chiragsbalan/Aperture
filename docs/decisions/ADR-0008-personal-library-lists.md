# ADR-0008 — Personal library (lists + diary)

- **Status:** Accepted
- **Date:** 2026-08-02
- **Related:** Lists LLD; Database Design (lists domain); [ADR-0004](ADR-0004-content-identity.md) (content refs); [ADR-0005](ADR-0005-auth.md) (AuthZ); PLAN.md P3; `phases/p3/work-breakdown.md`
- **Implements in:** P3.1 (watchlist), P3.2 (favorites), P3.3 (custom lists / reorder), P3.4 (diary / `watch_entries`) — shipped as `v0.4.0`

## Context

Phase 3 ships a personal library on the public product. Watchlist and favorites are **unique per user** (Lists LLD), must reference **Aperture** titles only (ADR-0004), and must never accept raw TMDb ids. Detail DTOs emit `type: "tv_show"` while search already exposes public `tv`, so polymorphic list APIs need an explicit type contract. Diary / watch history is a separate concept (many events per title) and must not be modeled as `list_items`.

## Decision

### Storage — lists

- Own tables **`lists`** and **`list_items`** in the Lists domain (`backend/app/lists/`).
- **`lists.kind`:** `watchlist` | `favorites` | `custom`.
- **System uniqueness:** partial unique index on `(owner_user_id, kind)` **WHERE** `kind IN ('watchlist','favorites')`.
- **Owner:** `owner_user_id` → `users.id` (Users profile), resolved from the authenticated Auth identity.
- **Items:** `(list_id, content_type, content_id)` with **UNIQUE** membership per list; `position` (dense `0..n-1` after reorder / compact delete).
- Persist **`content_type`** as `content_items` values: `movie` | `tv_show`. Existence is validated in the Lists **service** via Metadata service (no TMDb client; no Metadata repository imports from Lists).
- Soft-delete is **not** used: custom lists are **hard-deleted** (FK cascade on `list_items`). System lists are never deleted by users.

### Storage — diary

- Table **`watch_entries`** in sibling package `backend/app/library/` (not `list_items`).
- Columns: `owner_user_id`, `content_type` / `content_id`, `watched_at` (**DATE**), optional `note` (≤ 1000), timestamps.
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
| PUT | `/api/v1/lists/{id}/items/reorder` | required owner; body `{ "item_ids": [...] }` |
| GET | `/api/v1/lists/{id}/contains` | required owner |

**Diary (P3.4)** — authenticated `/api/v1/me/watch-entries` (GET/POST/PATCH/DELETE). Optional create flag `remove_from_watchlist` orchestrated in the **API layer**: flush-only diary create + watchlist remove, then **one** `session.commit()` (never remove-before-create).

### AuthZ / visibility

`lists.visibility` is **`private` | `public` only** (pc.1). Existing `unlisted` rows were migrated to `private`; API writes reject `unlisted`.

| Case | Behavior |
|---|---|
| Private custom list, non-owner or anon | **404** (no existence leak) |
| Public custom list | Readable by id (OptionalIdentity: missing → anon; invalid token → **401**) |
| System kinds via `/lists/{id}*` mutate/contains/GET | **404** (`require_custom_list_mutable` / custom-only read surface) |
| System watchlist/favorites visibility | Owner toggles via `PATCH /me/watchlist` / `PATCH /me/favorites`; public read by username lands in profile-complete `pc.2` |
| Shareable list DTO | `is_owner` boolean; `owner_user_id` only for owner (null for others) |
| Diary | **Always public** on profile (no visibility column / toggle). Public read: `GET /api/v1/users/{username}/watch-entries` (see [ADR-0009](ADR-0009-public-profiles.md)). Owner mutate/list: `/api/v1/me/watch-entries` |
| Diary PATCH/DELETE other user’s entry | **404** |

### Reorder

**Transaction + dense renumber** to `0..n-1` under `lock_list` (not fractional indexing). Body `item_ids` must be a permutation of current membership (else **422**). Item delete compact-renumbers the same way. Acceptable while lists stay capped at 500 items.

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
5. **Fractional / sparse positions** — deferred; dense renumber under lock is enough at the 500-item cap.
6. **library → lists import for `remove_from_watchlist`** — rejected; API-layer orchestration preserves sibling isolation.
7. **Create system lists at registration only** — rejected; lazy-create on first `/me/...` access.

## Consequences

- Frontend routes: `/library/watchlist`, `/library/favorites`, `/library/lists`, `/lists/[id]`, `/library/diary`; detail actions for watchlist, favorites, Add to list, Log watch.
- OpenSearch hosting remains **ADR-0007** at P5 exit — this ADR does not consume that number.
- Phase exit tag: **`v0.4.0`**.

## Future evolution

- Fractional / sparse reorder if renumber cost becomes measurable beyond the 500-item cap.
- Optional FK from `list_items.content_id` → `content_items.id` if orphan cleanup becomes painful.
- Public list discovery / trending; episode-level diary; Letterboxd import.
- Username-scoped public shelf APIs — [ADR-0009](ADR-0009-public-profiles.md) / profile-complete track.
