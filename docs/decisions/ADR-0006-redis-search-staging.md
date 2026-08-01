# ADR-0006 — Redis and search staging

- **Status:** Accepted
- **Date:** 2026-08-01
- **Related:** Search LLD; Technical Architecture Part 2; Database Design; Development Roadmap; PLAN.md P2 / P5–P6 / P11
- **Implements in:** Redis cache P2.4; PG FTS P2.3; OpenSearch dual-write P6; Redis harden P11
- **Follow-on:** OpenSearch **hosting** choice deferred to **ADR-0007** at P5 exit

## Context

Roadmap Phase 11 bundles “Redis caching” with late production hardening, and Search LLD evolves from PostgreSQL full-text search to OpenSearch without changing the public API. PLAN needs an earlier, explicit staging so metadata (P2) can cache and rate-limit across instances, while search stays cheap until catalog and streaming justify a second search system.

PostgreSQL remains the only authoritative store (Database Design). Redis and OpenSearch are derived/cache layers.

## Decision

### Redis — introduce in P2, harden in P11

| Stage | When | Scope |
|---|---|---|
| Intro | **P2.4** | Shared cache + rate-limit backend; Compose (and later cloud) Redis; multi-instance API readiness |
| Harden | **P11** | Production Redis posture (sizing, eviction, monitoring, resilience)—not the first introduction |

**This ADR supersedes Roadmap wording that implies Redis waits until P11.** P11 means harden/operate, not “add Redis for the first time.”

**Usage rules:**

- Redis is **non-authoritative**; all entries disposable and rebuildable from Postgres.
- Prefer (P2.4): hot metadata reads; **search** IP rate-limit counters via atomic `CacheBackend.incr`; optional job coordination precursors.
- **Auth** login/register/refresh rate limits stay on **Postgres** through P2–P10; migrate those counters to Redis in **P11** (with Redis harden). See ADR-0005 Future evolution.
- Avoid: caching auth identity payloads; refresh-grace L1 (process memory only — never Redis); caching highly personalized results until profiling demands it.
- Invalidation: update/expire affected keys after writes; no global flush as the default tool.
- Degrade: metadata miss → Postgres; search RL `incr` failure → process-local counter (do not go open).

Local Compose adds Redis when P2.4 lands. Cloud Redis provider/tier is chosen at implementation time (cost still driven by ADR-0003 free-tier posture until upgrade).

### Search — PG FTS first, OpenSearch later, FTS forever as fallback

| Stage | When | Scope |
|---|---|---|
| Search v1 | **P2.3** | PostgreSQL FTS across movies / TV / people |
| Host decision | **P5 exit** | Record OpenSearch hosting in **ADR-0007** (before P6 dual-write) |
| Search platform | **P6** | OpenSearch dual-write, autocomplete/facets; **verified PG FTS fallback** under outage test |
| Later | P8+ | Semantic/vector search may sit beside the same public search API |

**Public search API stays stable** across backends (Search LLD). OpenSearch (and future vectors) are **indexes**, not sources of truth—index from canonical content (ADR-0004).

**Composite mode (P6+):** query OpenSearch when healthy; on outage or explicit degrade, serve PG FTS. PG FTS is never deleted as a capability.

## Alternatives considered

1. **Redis only at P11 (Roadmap literal)** — rejected for PLAN; P2 metadata and multi-instance rate limits need a shared cache earlier.
2. **OpenSearch from day one** — rejected; ops burden before catalog/streaming exist; PG FTS is enough for early discovery.
3. **Skip PG FTS and jump to OpenSearch at P6** — rejected; no fallback and no P2 search UX.
4. **Memcached instead of Redis** — rejected; Redis offers richer structures, atomic counters, and future queue/coordination options already assumed in architecture notes.
5. **Make OpenSearch authoritative for titles** — rejected; violates Postgres-as-truth and ADR-0004.

## Consequences

- P2.3 can ship search without Redis; P2.4 wires Redis for **metadata cache + search RL** and documents multi-instance readiness (including notes for `watch_entries` / P3 as PLAN requires).
- P1 auth rate limits remain DB-backed after P2.4; **auth RL → Redis is deferred to P11** (correct under multi-instance today; avoids expanding Redis trust boundary for auth paths in P2).
- P5 must close **ADR-0007** (OpenSearch host) before P6 implementation work depends on a cluster URL.
- Roadmap Phase 11 Redis bullets are interpreted as hardening/ops **plus** finishing auth counter migration, not greenfield Redis adoption.
- Search LLD “Phase 2 OpenSearch” language is staged by **this ADR + PLAN** (FTS in product P2, OpenSearch in product P6).

## Future evolution

- ADR-0007: OpenSearch provider, sizing, and network placement (P5 exit).
- **P11:** Redis HA, eviction policy review, cache hit SLOs; **migrate auth rate-limit counters** to shared Redis `CacheBackend` (ADR-0005); keep Postgres counters as durable audit/backup if useful.
- Vector/semantic index (P8+) should reuse the same “derived index + API façade” pattern; supersede or extend this ADR if the fallback matrix changes.
