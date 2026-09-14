# ADR-0017 — Person profile enrichment (hybrid detail)

- **Status:** Accepted
- **Date:** 2026-08-09
- **Amended:** 2026-09-14 — Known for ranks principal roles before guest appearances (popularity within each tier). Acting fills from acted titles first. Cache keys `meta:person:v7` and `meta:person:enrich:v6`.
- **Related:** [ADR-0004](ADR-0004-content-identity.md); [ADR-0006](ADR-0006-redis-search-staging.md); [ADR-0011](ADR-0011-title-poster-morph.md); [ADR-0013](ADR-0013-lean-catalog-option-b.md); PLAN.md P2
- **Implements in:** `feature/person-profile-pages`
- **Extends:** ADR-0013 Option B hybrid pattern to `/people/{uuid}` (no Alembic in Slice A)

## Context

Person pages were Postgres-only shells: seed/credit bios plus local `content_credits` (“Known for”), with no TMDb enrich, department filter, socials, or cold morph cards. Title detail already uses lean PG stub + Redis/TMDb enrichment (ADR-0013). Person filmography from ingest edges alone is far too sparse for a title-parity profile (e.g. Fishburne-scale catalogs).

We needed a hybrid that:

1. Keeps **durable person shells** and ingest **credit edges** in Postgres (ADR-0004).
2. Treats **combined filmography / also_known_as / social ids / known_for_department** as Redis ↔ TMDb enrichment (non-authoritative).
3. **Never** serves a blank filmography over a seeded person when TMDb times out (capped PG fallback).
4. Bounds latency, stampede, and abuse (≤2s live TMDb, Redis lock + inflight semaphore, dual rate limits).

## Alternatives considered

1. **Fat Postgres person warehouse** (persist full combined_credits) — rejected; same Option B reasons as ADR-0013 (size, ToS churn, fixture bloat).
2. **Enrich-only with empty on miss** (title chrome style) — rejected for filmography; seeded pages must not go blank when TMDb fails.
3. **Lazy write enrich bio back to `people`** — deferred (Slice B / optional `refreshed_at`); Slice A overlays enrich text without PG bio mutation.
4. **Letterboxd-style role URLs** — rejected; one `/people/{uuid}` + in-page department filter.
5. **Process-only singleflight** (title enrich today) — insufficient alone under multi-instance stampede; Redis lock is primary coalesce.

## Decision

### Ownership (PG vs Redis)

| Concern | Store | Notes |
|---|---|---|
| Person shell (name, bio, dates, place, profile_path) | Postgres `people` | Durable; enrich may overlay bio text in the assembled DTO |
| Ingest credit edges | Postgres `content_credits` | Identity graph + **display fallback** only (not full TMDb dump) |
| `combined_credits` filmography, `also_known_as`, `known_for_department`, social ids | Redis enrich section | Rebuilt from TMDb; never sole source of truth |
| Assembled `PersonDetail` | Redis detail key | Short TTL full DTO |

**Alembic:** none in Slice A (no new ORM columns).

### Caps and curation

| Cap | Limit |
|---|---|
| `known_for` | ≤30 (shown in UI) |
| `filmography` | ≤150 unique titles |
| `also_known_as` | ≤20 |

Drop `adult` rows and episode-level credits (keep movie/TV show-level only). Dedupe by `(media_type, tmdb_id, department)` so a director cameo still appears under Directing **and** Acting. Cap **150 unique titles** (cards may repeat a title across departments). Batch-map TMDb ids → Aperture UUIDs via `external_ids` when present.

**Two-pass curation** from the full parsed `combined_credits` set:

1. **Filmography pass** — unchanged from Slice A: multi-department cards, ≤150 unique titles, popularity-ordered cap fill.
2. **Known for pass** — separate `select_known_for()` over the **full** parsed set (not a slice of filmography). One card per `(media_type, tmdb_id)`; when a title has multi-department credits, prefer the card whose department matches `known_for_department`.

**Known for ordering** (within the ≤30 cap):

1. Principal roles in the primary department, popularity descending (missing popularity last), then title A–Z.
2. Acting only: guest appearances in Acting next, before any other department. Other professions: principal roles in the remaining departments (`DEPARTMENT_PRECEDENCE`, then unknown A–Z), then guest appearances from every department.
3. A guest appearance is a Self credit (unless a long-running host), a one-episode acting spot, a Talk / Reality / News appearance, a job whose name contains Guest, or a TV crew credit under 8 episodes. Full-time staff (high `episode_count`, including talk-show producers and hosts) stay in the principal tier. Rating does not affect which titles are chosen or their order.

### Cache keys and TTLs

| Key | Purpose | TTL |
|---|---|---|
| `meta:person:v7:{uuid}` | Assembled PersonDetail | `metadata_cache_ttl_seconds` (default 600s) |
| `meta:person:enrich:v6:{uuid}` | Enrich section JSON | `metadata_enrichment_cache_ttl_seconds` (default 6h) |
| Same enrich key + `{"_neg": true}` | Skip live TMDb retry | `metadata_enrichment_negative_cache_ttl_seconds` (default 60s) |
| `meta:person:enrich:lock:{uuid}` | Distributed enrich lock | Short (seconds); leader deletes on completion |

**Negative cache** means “skip TMDb retry.” It must **never** cause an empty filmography assemble over non-empty PG credits. On neg/timeout/MISS after fail: merge enrich overlay fields when safe, always attach **capped PG filmography/known_for fallback**.

### Live TMDb path

1. Detail HIT (`meta:person:v7`) → return.
2. Else acquire Redis enrich lock + enter global inflight semaphore (max **16**).
3. Load PG shell + capped credits (fallback material).
4. Enrich section HIT → merge (enrich filmography preferred).
5. Else if neg sentinel → merge with **PG filmography fallback** (no live TMDb).
6. Else dual rate limit → TMDb `person/{id}` with `append_to_response=combined_credits,external_ids` under `asyncio.wait_for` ≤ **2s**.
7. Curate → SET enrich (+ detail) → return.
8. On timeout/error → SET neg (short TTL) → assemble with PG fallback → HTTP **200**.

Process-local Futures are optional only; Redis lock + semaphore are the stampede controls.

### Dual rate limit

Charged only when about to call live TMDb (HIT / neg skip charge):

| Subject | Bucket | Default |
|---|---|---|
| BFF-attested client IP (`X-Aperture-Client-IP` + matching BFF secret) | `metadata:rl:person-enrich:ip:{sha256}` | **20 / 60s** |
| Unattested / SSR without trusted IP | `metadata:rl:person-enrich:global` | separate global budget |

SSR `fetchPerson` must send trusted client-IP headers (same pattern as search / home rails).

### API contract (`PersonDetail`)

- Shell: name, biography (plain text; enrich overlay preferred), dates, place, profile_url, `known_for_department`, `also_known_as[]`, `socials[]`.
- `PersonTitleCard`: `type` `movie|tv` + (`content_id` and/or `tmdb_id`) + title/year/poster + credit fields for filter/headings — enough for `TitleNavPoster`. Also `popularity`, ISO `release_date`, `runtime_minutes`, and TMDB `rating` (`value` 0–5, `source`, `count`) for client sort.
- `known_for[]` (≤30, server-curated, **shown** as a Similar-style poster grid), `filmography[]` (≤150, text timeline), `departments[]` for client FormSelect.
- Social URLs: HTTPS + host allowlist + `_require_https_url`; never raw unvalidated TMDb homepage hrefs.

### Client presentation (Slice A+)

After the biography hairline (`.title-actions-rule`):

1. **Known for** — Similar-style `.poster-grid` + `TitleNavPoster`; no `.poster-meta`, no FormSelects. Hide section when empty. Desktop 6 columns (≤5 rows at cap 30); mobile stays **4 columns** (product lock).
2. **Filmography** — text-only timeline (`TitleTextLink` rows; styled `next/link` for warm UUID and cold `/tmdb/` resolve; never `TitlePosterLink` / `TmdbResolveLink`). Profession + sort `FormSelect`s kept. Year group headers always **newest → oldest**; FormSelect sort applies **within year only** (default sort: popularity). Infinite scroll windows **24** via `ShelfInfiniteScroll`. Signed-in your-rating sort uses `GET /me/watch-entries/ratings` (latest non-null diary rating, cap 150).

### Explicit non-goals (Slice B)

- Library-aware filmography (watched fade), decade grouping, search filmography expansion (ADR-0016 optional), `people.refreshed_at` / lazy PG bio durability.

## Consequences

- Person pages can show rich filmography without warehouse PG; warm path is Redis HIT.
- Caps intentionally truncate mega catalogs; PG fallback remains sparse ingest edges.
- PG biography may lag Redis enrich text until a later durability slice.
- Global/unattested RL may 429 scrapers; attested browse stays usable; warm HIT skips TMDb charge.
- Redis lock waiters add bounded latency under stampede (accepted).

## Future evolution

- Optional `people.refreshed_at` + lazy bio write if ToS/durability requires it.
- Per-subsection enrich keys if socials vs filmography need different TTLs.
- Library-aware filmography and search expansion as separate slices.
