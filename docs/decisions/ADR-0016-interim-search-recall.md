# ADR-0016 — Interim search recall (pre-OpenSearch)

- **Status:** Accepted
- **Date:** 2026-08-08
- **Related:** [ADR-0004](ADR-0004-content-identity.md); [ADR-0006](ADR-0006-redis-search-staging.md); [ADR-0011](ADR-0011-title-poster-morph.md); [ADR-0013](ADR-0013-lean-catalog-option-b.md); PLAN.md P2 / P5–P6
- **Implements in:** `feature/p2.x-search-recall`
- **Does not replace:** ADR-0006 OpenSearch path; **ADR-0007** (OpenSearch hosting) still due at P5 exit

## Context

Search v1 (P2.3) is PostgreSQL FTS over the seed catalog only (`plainto_tsquery` AND tokens). Most real-world queries return zero hits. Title detail already has TMDb recommendations/similar enrichment and home rails already show cold TMDb cards via resolve-on-click. v0.3.0 deferred “TMDb-on-search-miss.” Full OpenSearch (P6) remains the long-term search platform, but empty/rigid search is a product blocker before P5/P6.

## Decision

Ship an **interim hybrid recall façade** on `GET /api/v1/search` without OpenSearch:

1. **Warm `results[]`** — unchanged PG FTS hits (Aperture UUIDs). `total` / `page` / `limit` stay warm-only.
2. **Additive sections (page 1 only):**
   - `external` — TMDb `/search/multi` cold title cards when local **title** hits are zero (and `types` allows movie/tv).
   - `related` — similar/recommendations for the **top-1** warm title hit (enrichment path), when `types` allows that title’s kind.
3. **Cold identity** — section cards carry `tmdb_id` + `movie|tv`; optional `content_id` when `external_ids` maps. Open via `TitleNavPoster` / resolve-on-click. **No ingest-on-search.**
4. **Latency** — FTS never waits on TMDb. Enrichment uses a short hard timeout (default **2s**), cache-first Redis, singleflight; failure → empty section(s), HTTP **200**.
5. **Weak locals** — when `0 < title_hits < 3`, External fills **only from cache** unless `SEARCH_EXTERNAL_WEAK_LIVE=true` (default **false**).
6. **`types=`** — person-only queries skip External/Related; External media filtered to requested kinds; Related only if top-1 type is allowed.
7. **Caps** — External ≤12, Related ≤12 (settings). Related today is further bounded by enrichment’s similar list (~6).

### Currently implemented (this ADR)

| Piece | Status |
|---|---|
| Additive `SearchResponse.external` / `related` / `match_quality` | Shipped |
| TMDb multi-search on `title_hits == 0` (page 1) | Shipped |
| Redis cache keys + negative TTL + process singleflight | Shipped |
| Related from top-1 warm title (enrichment similar) | Shipped |
| FE unified title grid (FTS + External + Related ranked) | Shipped |
| On-page expanded query field on `/search` (no header overlay) | Shipped |
| Additive ILIKE / word-boundary title ranking (with FTS) | Shipped |
| Cold posters via `TitleNavPoster` | Shipped |
| Mocked TMDb tests for gates / degrade | Shipped |

### Deferred to P6 (and ADR-0007)

| Piece | Notes |
|---|---|
| OpenSearch hosting (ADR-0007) | P5 exit gate |
| Dual-write index from Postgres | OpenSearch documents keyed by Aperture UUID |
| Composite query (OS primary → PG FTS fallback) | Verified under outage test |
| Autocomplete / typeahead | Header overlay + suggest API |
| Facets | Genre/year/type filters as first-class search UX |
| Serious fuzzy / typo tolerance in-index | Prefer OS analyzers over pre-P6 `pg_trgm` |
| People → filmography expansion in search | Optional later; not required for OS |

### Remap when P6 lands

- OpenSearch becomes primary for warm `results[]` (+ autocomplete/facets).
- `external` / `related` remain optional enrichment for sparse local catalog / discovery (or thin out if the local index is large enough).
- PG FTS remains forever fallback (ADR-0006).
- Public envelope stays additive/stable; do not put cold-only rows into `results[]`.

### Redis keys (non-authoritative)

| Key | Purpose | Positive TTL | Negative TTL |
|---|---|---|---|
| `search:tmdb:ext:v1:{sha256(norm_q\|types)}` | External card payload JSON | 1h | 60s |
| Enrichment section keys (`meta:movie\|tv:enrich:v2:{uuid}`) | Related similar source | existing enrichment TTL | existing neg TTL |

Search IP rate limit (`search:rl:ip:*`) continues to gate the route. Dedicated TMDb search timeout: `SEARCH_TMDB_TIMEOUT_MS` (default 2000).

### API sketch

```text
SearchResponse {
  q, page, limit, total, results[]   # warm FTS (unchanged semantics)
  match_quality?: "strong"|"weak"|"none"
  related?: SearchCard[]             # page==1 only
  external?: SearchCard[]            # page==1 only
}

SearchCard {
  type: "movie"|"tv"
  title, year?, poster_url?
  tmdb_id: int
  content_id?: uuid | null
}
```

## Alternatives considered

1. **Pull OpenSearch to now** — rejected; ops + ADR-0007 + dual-write before catalog/streaming justify it (ADR-0006).
2. **Ingest-on-search to grow FTS** — rejected; write amplification / identity churn vs ADR-0004 resolve-on-click.
3. **Flat `match_kind` merge into `results[]`** — rejected; breaks UUID-required clients and pagination/`total` semantics.
4. **Unified cross-source score** — rejected; heterogeneous signals; poor P6 remap.
5. **`pg_trgm` now** — deferred; TMDb External covers interim typo/recall breadth; P6 owns serious fuzzy.

## Consequences

- Zero local title hits can still show a useful “More titles” grid when TMDb is available.
- Strong local hits do not pay a live TMDb search cost by default.
- Search latency stays bounded by FTS + optional ≤2s enrichment; BFF/SSR timeouts are not extended for TMDb.
- Clients that ignore new fields keep working; FE that only checks `results.length` must treat sections as success (shipped with this change).
- TMDb quota and Redis key churn become search-path concerns (mitigated by cache + gates).

## Future evolution

- ADR-0007 at P5 exit; P6 dual-write + autocomplete/facets + outage-tested FTS fallback.
- Optional: people filmography section; weak-live External flag on by default after metrics; External people cards; paginated sections.
- Amend this ADR if P6 removes or renames interim sections.
