# ADR-0013 — Lean catalog projection (Option B)

- **Status:** Accepted
- **Date:** 2026-08-07
- **Related:** [ADR-0004](ADR-0004-content-identity.md) (canonical identity); [ADR-0006](ADR-0006-redis-search-staging.md) (Redis cache staging); Metadata LLD; PLAN.md P2
- **Implements in:** PR #42 (`feature/lean-catalog-option-b`)
- **Amends:** ADR-0004 (persisted title projection); ADR-0006 (detail hybrid read + enrichment keys)

## Context

Early P2 persisted a fat TMDb-shaped `content_items.extras` JSONB (providers, videos, images, similar, genres, …). That ballooned Postgres/fixture size, duplicated Redis detail DTOs, and still could not satisfy TMDb’s ≤6‑month refresh expectation for every volatile field without constant rewrite churn.

We needed a projection that:

1. Keeps **Aperture UUIDs** as the only identity for library soft-refs (ADR-0004).
2. Keeps **shelf-critical fields** (title, year/date, poster) durable in Postgres when Redis/TMDb are down.
3. Stops treating Postgres as a full TMDb warehouse for providers / galleries / similar / meta tabs.
4. Remains rebuildable: Redis eviction must be a cache miss, not catalog data loss.

## Alternatives considered

1. **Option A — Fat Postgres warehouse** (status quo) — rejected; extras growth, fixture bloat, and ToS refresh cost on every volatile key.
2. **Option B — Lean Postgres stub + Redis/TMDb enrichment** — **accepted** (this ADR).
3. **Redis (or TMDb) as source of truth for titles** — rejected; violates Postgres-as-truth (ADR-0004 / ADR-0006); Upstash TTL would become data loss.
4. **UUID + name-only stubs** (no poster/year in Postgres) — rejected; shelves and warm detail degrade unacceptably when enrichment is cold.
5. **Library FKs on raw `tmdb_id`** — rejected; remaps / multi-source identity break (ADR-0004).

## Decision

### Durable stub (Postgres)

`content_items` (+ subtype tables) hold a **lean stub**:

| Durable | Not durable |
|---|---|
| id, content_type, title, original_title, overview, poster/backdrop paths, popularity | `watch_providers`, `similar` |
| subtype dates (`movies.release_date`, `tv_shows.first_air_date`, …) | tagline, genres, keywords, studios, networks, releases, spoken_languages, alternative_titles |
| `external_ids` (TMDb ↔ UUID) | `videos`, `images` galleries |
| `content_items.refreshed_at` (lean-stub refresh clock) | |
| People shells + `content_credits`; TV season stubs | |

**`content_items.extras` is always persisted as `{}`.** `lean_extras_for_persist()` returns an empty object; upserts must not wipe unrelated columns when `extras` is omitted (`None`). Title chrome is assembled at read time from Redis enrichment and/or live TMDb.

Migrations (shipped with the app):

| Revision | Effect |
|---|---|
| `b4c5d6e7f8a9` | Strip `watch_providers` / `videos` / `images` / `similar` from existing extras |
| `c5d6e7f8a9b0` | Add `refreshed_at` (backfill from `updated_at`); set all `extras` to `{}` |

Seed fixtures under `backend/app/metadata/fixtures/` match the lean projection (`extras: {}`).

### Enrichment (Redis ↔ TMDb)

| Concern | Rule |
|---|---|
| Section key | `meta:movie\|tv:enrich:v1:{uuid}` |
| Positive TTL | `metadata_enrichment_cache_ttl_seconds` (default **6h**) |
| Negative TTL | `metadata_enrichment_negative_cache_ttl_seconds` (default **60s**); sentinel `{"_neg": true}` on enrich failure — skip live retry for that window |
| Full detail DTO | Existing movie/tv detail keys (default **600s**); assembled after stub + enrichment merge |
| Single-flight | Per-process coalesce for enrichment fetch and for detail MISS assemble; Futures share JSON / success tokens — **never** ORM instances across sessions |
| Degrade | Enrichment/TMDb failure → HTTP **200** with empty chrome sections (not 503) |

Stub refresh **must not** delete enrichment keys (detail-key invalidate only). Warm enrichment survives lean-column refresh.

### Lazy + batch stub refresh (ToS)

Lean stub columns refresh when `refreshed_at` is older than `metadata_stub_max_age_days` (default **150**, capped ≤180):

- **Lazy:** on title detail GET — TMDb lean fetch (no credits append), upsert stub, **`session.commit()` immediately**, then continue assemble.
- **Batch CLI:** `refresh-stale` / `refresh-changes` (TMDb `/changes`) in `app.metadata.cli` / `stub_refresh.py`.
- **CLI safety:** `--limit` 1…500, `--days` 1…14, `--dry-run`; refuse non-loopback `DATABASE_URL` unless `--allow-non-local-db`.

### Hybrid detail read

`GET /api/v1/movies|{tv}/{uuid}`:

1. Redis full-detail DTO HIT → return.
2. MISS → per-`content_id` singleflight assemble.
3. Core from Postgres lean stub; optional lazy stub refresh (inner coalesce; detail SF outermost).
4. Enrichment section HIT → merge; else single-flight TMDb enrich → SET section → merge.
5. SET full detail DTO → return.
6. On enrich failure → negative sentinel (short TTL) + empty sections.

Resolve / ingest may warm the detail cache with in-memory enrichment extras without persisting them to Postgres.

### Library and cold paths

- Soft-refs stay on Aperture UUIDs; `get_content_summaries` reads stub title / year / poster.
- Warm UUID detail must remain usable from the stub when TMDb is down (sparse meta tabs OK).
- Home rails stay TMDb-pool cached (unchanged; not UUID shelves).

## Consequences

- Postgres and fixture size shrink; volatile chrome churn hits Redis/TMDb, not JSONB rewrites.
- Post-deploy cold views hit TMDb enrich until section keys warm; negative cache bounds outage retry storms (~60s).
- Operators must run migrate-on-start through `c5d6e7f8a9b0` with the app that expects empty extras — do not stamp prod ahead of `main`.
- Batch refresh CLIs are local-by-default; production batch jobs need an explicit `--allow-non-local-db` policy if ever introduced.
- Credits remain durable via `content_credits` (not enrichment Redis). Season episode hydrate stays on-demand (separate from Option B extras).

## Future evolution

- Distributed (Redis) locks if multi-instance stampede on cold enrich becomes measurable (today: process singleflight).
- Optional `refreshed_at` index if batch refresh scans dominate.
- Unauth detail IP rate limits only if abuse appears (deferred; would change normal browse UX).
- Per-subsection Redis keys/TTLs (providers vs similar) if one 6h blob is too coarse.
- Supersede or extend this ADR if durable extras regain selected chrome fields.
