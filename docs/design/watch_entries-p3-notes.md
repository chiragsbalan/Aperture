# `watch_entries` notes (for P3 Personal Library)

**Status:** Documentation only in P2.4 — no table implementation yet.  
**Authority:** PLAN.md P2.4 / P3; ADR-0004 content refs.

## Purpose

Diary / watch history: record that a user watched a movie or TV episode (or show) at a point in time. Distinct from watchlist (intent) and favorites (preference).

## Likely shape (draft)

| Field | Notes |
|---|---|
| `id` | UUIDv7 PK |
| `user_id` | FK → users |
| `content_ref` | Typed ref `{"type","id"}` — movie / tv / episode (exact enum locked in P3) |
| `watched_at` | timestamptz (user-asserted or client clock; server validates range) |
| `rating_id` | Optional FK later when ratings land (P4) |
| timestamps | `created_at` / `updated_at` |

## Why it waits for P3

P3 owns Personal Library (watchlist → favorites → lists → diary/`watch_entries`). Shipping the table earlier would couple Metadata/Search to an unfinished UX and migration story. Canonical content ids from P2 are the prerequisite; the diary product slice is P3.

## Non-goals here

- No Alembic revision in P2.4
- No API or UI for diary until P3
