# ADR-0015 — Hybrid title ratings (TMDB → Aperture @ 100)

- **Status:** Accepted
- **Date:** 2026-08-08
- **Related:** [ADR-0008](ADR-0008-personal-library-lists.md) (diary half-stars); [ADR-0013](ADR-0013-lean-catalog-option-b.md) (enrichment vs lean stub); PLAN.md P4
- **Implements in:** `feature/p4.1-title-ratings`

## Context

Diary entries already store optional personal half-star ratings (`watch_entries.rating`, 0.5–5). Title detail had no community score. TMDB exposes `vote_average` (0–10) and `vote_count`, not a 5-star scale and not a per-star histogram. Early Aperture traffic will not reach meaningful community volume for most titles.

## Decision

**Hybrid display on movie/TV detail:**

| Condition | Score shown |
|---|---|
| Aperture distinct user ratings ≥ `APERTURE_RATING_SWITCH_THRESHOLD` (default **100**) | Mean of those ratings (0–5) |
| Otherwise, when TMDB `vote_count > 0` and `vote_average > 0` | `vote_average / 2` on the 0–5 scale |
| Else | Omit the score UI |

**Aggregation:** one vote per user per title = that user’s **latest** non-null diary `rating` (`watched_at` DESC, then `created_at`, then `id`). Rewatches without a rating do not change the aggregate.

**Storage:**

- TMDB votes live in **enrichment** (`tmdb_vote_average`, `tmdb_vote_count`) — not lean Postgres stubs (ADR-0013).
- Aperture aggregates in `content_rating_stats` (`rating_count`, `rating_sum`), recomputed on diary create/patch/delete when ratings can change.
- Detail DTO field: `rating: { value, source: tmdb|aperture, count } | null`.

**UI:** `4.5/5` + five-star row (fill matches the one-decimal display score) between title credits and tagline. Star/number color from that displayed score: red (&lt;2) → orange (2–2.9) → yellow/gold (3–3.9) → green (≥4). No source badge.

**Cache:** detail + enrichment Redis keys bumped (`meta:movie:v2`, `meta:tv:v4`, `enrich:v2`). Rating-affecting diary writes invalidate the title detail key.

## Alternatives considered

1. **Aperture-only** — rejected for cold start / empty hero scores.
2. **Blended TMDB + Aperture** — rejected; full cutover at threshold is clearer.
3. **Separate `title_ratings` table** — deferred; diary latest-per-user is enough for v1.
4. **Persist TMDB votes on lean stub** — rejected (ADR-0013 volatile chrome).

## Consequences

- Title pages show a score for most TMDB-backed titles immediately.
- Community average replaces TMDB only after 100 distinct raters.
- TV status copy `Ended` → **Finished** is product display (unrelated to scores but shipped with title meta polish).

## Future evolution

- Ratings histogram / Ratings tab from Aperture votes only (TMDB has no API breakdown).
- Optional separate rate-without-log product.
- Profile / activity surfaces for rated titles (PLAN P4).
