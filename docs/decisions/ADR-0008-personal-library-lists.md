# ADR-0008 — Personal library lists (system watchlist / favorites)

- **Status:** Accepted
- **Date:** 2026-08-02
- **Related:** Lists LLD; Database Design (lists domain); [ADR-0004](ADR-0004-content-identity.md) (content refs); [ADR-0005](ADR-0005-auth.md) (AuthZ); PLAN.md P3; `phases/p3/work-breakdown.md`
- **Implements in:** P3.1 (watchlist) and P3.2 (favorites); custom lists / reorder (P3.3) and diary / `watch_entries` (P3.4) build on this model without changing system-list rules

## Context

Phase 3 ships a personal library on the public product. Watchlist and favorites are **unique per user** (Lists LLD), must reference **Aperture** titles only (ADR-0004), and must never accept raw TMDb ids. Detail DTOs emit `type: "tv_show"` while search already exposes public `tv`, so polymorphic list APIs need an explicit type contract. Diary / watch history is a separate concept (many events per title) and must not be modeled as `list_items`.

## Decision

### Storage

- Own tables **`lists`** and **`list_items`** in the Lists domain (`backend/app/lists/`).
- **`lists.kind`:** `watchlist` | `favorites` | `custom`.
- **System uniqueness:** partial unique index on `(owner_user_id, kind)` **WHERE** `kind IN ('watchlist','favorites')`.
- **Owner:** `owner_user_id` → `users.id` (Users profile), resolved from the authenticated Auth identity.
- **Items:** `(list_id, content_type, content_id)` with **UNIQUE** membership per list; `position` on the item (append-only in P3.1/P3.2; reorder lands in P3.3).
- Persist **`content_type`** as `content_items` values: `movie` | `tv_show`. Existence is validated in the Lists **service** via Metadata service (no TMDb client; no Metadata repository imports from Lists).
- Soft-delete is **not** used for system lists in P3; custom-list delete policy remains for P3.3.

### Public API content refs

Polymorphic bodies and contains keys use public types aligned with search:

| Public `type` | Accepted aliases on input | Stored `list_items.content_type` |
|---|---|---|
| `movie` | — | `movie` |
| `tv` | `tv_show` | `tv_show` |

- Responses always emit **`movie` | `tv`**.
- **`person`** (and other types) → **422** for list membership in P3.
- Unknown Aperture title id → **404** (same convention as Metadata detail).
- Prefer **idempotent** add (200 if already present) and remove (204 if already absent).

### HTTP surface (P3.1 / P3.2)

Authenticated routes under `/api/v1/me/watchlist` and `/api/v1/me/favorites` (get page, add/remove item, batch `contains`). System lists are **lazy-created** on first access (race-safe). Clients do not pass `list_id` or `owner_user_id` for these operations.

### What is not a list

- **`watch_entries` / diary** (P3.4): separate table/package; rewatches = additional rows for the same content. Not stored in `list_items`.
- **“Completed”** as a system kind: not a PLAN ship gate; defer or treat as a custom list later.

## Alternatives considered

1. **Separate `watchlist_items` / `favorite_items` tables** — rejected; Lists LLD and PLAN model one lists domain with `kind`, shared helpers, and later custom lists.
2. **Public API type `tv_show` only (match detail DTOs)** — rejected; conflicts with search public types and PLAN/`{"type":"movie|tv"}` guidance; accept `tv_show` as input alias instead.
3. **Store public `tv` in `list_items.content_type`** — rejected; keep persistence aligned with `content_items.content_type` for validation and future integrity options.
4. **Put diary rows in `list_items`** — rejected; diary is multi-event history, not 0–1 membership.
5. **Create system lists at registration only** — rejected for P3; lazy-create on first `/me/...` access is enough and avoids unused rows.

## Consequences

- Lists module sits beside Search/Auth in import-linter layers; may call Users + Metadata **services** only (not Metadata ingest/CLI/repository as a public boundary).
- Caps for P3 MVP: ≤ **500** items per list; write rate limits keyed by identity via `CacheBackend`.
- Frontend detail actions send public `movie` | `tv` (map detail `tv_show` → `tv` before calling the API).
- Custom lists (P3.3) reuse the same tables with `kind=custom`; system kinds remain undeletable via custom-list delete APIs.
- OpenSearch hosting remains **ADR-0007** at P5 exit — this ADR does not consume that number.

## Future evolution

- Fractional / sparse reorder positions (P3.3) — document approach in code or a short note if it diverges from Lists LLD §14.
- Optional FK from `list_items.content_id` → `content_items.id` if orphan cleanup becomes painful.
- Public / unlisted list discovery is later; visibility enum exists early but private system lists are the P3.1/P3.2 default.
