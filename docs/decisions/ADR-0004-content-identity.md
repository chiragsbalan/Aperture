# ADR-0004 — Content identity (canonical catalog)

- **Status:** Accepted
- **Date:** 2026-08-01
- **Related:** Domain Model PDF; Database Design PDFs; Metadata LLD; PLAN.md P2.1+; [ADR-0008](ADR-0008-personal-library-lists.md) (list content-ref typing)
- **Implements in:** P2 (canonical catalog + detail UX); later domains reference these ids
- **Amended:** 2026-08-05 — signed-in home discovery rails (cold TMDb cards; server-only TMDb)

## Context

Aperture is a social film/TV product, not a TMDb proxy. Lists, reviews, watch history, streaming badges, and search must point at stable internal identifiers. If every feature stored raw TMDb (or other provider) ids, merges, remaps, and multi-source ingest would break referential integrity across domains.

Database Design also models seasons, episodes, and people as first-class tables—not nested blobs inside a single “title” row—so foreign keys and public URLs need a clear ownership story.

## Decision

**Canonical content lives in PostgreSQL under Aperture-owned ids (UUIDv7 per ADR-0002).** External providers are sources, not the source of truth.

**Core shape:**

| Concept | Rule |
|---|---|
| Titles | `content_items` holds the canonical movie/TV-show row (type + Aperture id) |
| Provider keys | `external_ids` maps provider keys → canonical item; **UNIQUE** `(source, source_namespace, external_id)` |
| Child hierarchy | Seasons and episodes are **outside** `content_items` (own tables keyed to the show) |
| People | People are **outside** `content_items` (own tables + their own `external_ids` where needed) |
| Credits | Unified cast/crew modeling across movie/TV (shared credit semantics; concrete join tables per Database Design) |
| Cross-domain refs | Other domains store Aperture ids (or typed refs), never raw TMDb ids as FKs |

**Public API:** REST under `/api/v1/movies|tv|people`. Opaque references use `{"type","id"}` where a polymorphic pointer is required (lists, activity, etc.). For **personal library lists**, public types are `movie` | `tv` (input may accept `tv_show`); persistence uses `content_items` types — see [ADR-0008](ADR-0008-personal-library-lists.md).

**Ingest:** Normalize TMDb (and later providers) into the canonical schema; dedupe via `external_ids` uniqueness before creating a new `content_items` row.

## Alternatives considered

1. **Proxy TMDb ids everywhere** — rejected; couples product data to one vendor and breaks multi-source merges.
2. **Single polymorphic “entity” table for titles, seasons, episodes, people** — rejected; seasons/episodes/people have different lifecycles and query patterns; keep them outside `content_items`.
3. **Separate cast/crew models per media type with incompatible semantics** — rejected; prefer unified credit semantics for discovery and “people who worked on…” queries.
4. **Natural keys from providers as PKs** — rejected; conflicts with ADR-0002 (UUIDv7) and multi-source identity.

## Consequences

- P2.1 must land `content_items` / `external_ids` (and related metadata tables) before lists/reviews can safely FK titles.
- Ingest jobs are idempotent on `(source, source_namespace, external_id)`.
- Remapping a provider id updates `external_ids`; canonical UUID stays stable for user-generated data.
- Search indexes and caches key off Aperture ids; provider ids are lookup aids only.
- Architecture/Metadata PDFs that stress “canonical model” remain valid; **this ADR is authoritative for the `content_items` + `external_ids` uniqueness rule**.
- **TMDb is server-only:** the API key stays in backend env; browsers receive Aperture UUIDs and CDN image URLs built from relative paths.
- **Fixture seed is a first-class ship path:** offline JSON under `backend/app/metadata/fixtures/` can populate prod via `make seed-metadata` (or equivalent) against `DATABASE_URL` without a TMDb key; live TMDb ingest remains optional.

### Signed-in home discovery rails (pc.2)

Cold **TMDb-id card** rails for the signed-in home (not Aperture UUID shelves):

| Route | Source |
|---|---|
| `GET /api/v1/catalog/now-in-theatres` | TMDb `now_playing` (popularity-sorted pool) |
| `GET /api/v1/catalog/top-movies` | TMDb top-rated movies (pool + per-request shuffle) |
| `GET /api/v1/catalog/top-tv-shows` | TMDb top-rated TV (pool + per-request shuffle) |

- Responses are lightweight poster cards keyed by **TMDb id** + kind; clients open titles via existing resolve / morph paths (warm Aperture UUID when known).
- Pools are Redis-cached with single-flight fill; `Cache-Control: private, no-store` on responses.
- Shared IP rate-limit bucket (`enforce_top_movies_rate_limit` / related knobs) across the three rails.
- Empty/degraded pools return empty lists rather than failing the home page.

## Future evolution

- Additional `source` values (IMDb, manual admin, etc.) without changing the unique key shape.
- OpenSearch documents (P6) and embeddings (P8+) reference the same canonical ids.
- If a true merge of two canonical items is ever required, prefer an explicit merge/redirect procedure over silently changing PKs—document in a superseding ADR if needed.
- Broader alignment of detail DTO `tv_show` with public `tv` across all surfaces may land later; list APIs already normalize per ADR-0008.
- Optional batched `GET /catalog/home-rails` to collapse the three rail RTTs.
