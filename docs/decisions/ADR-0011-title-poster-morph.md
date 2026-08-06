# ADR-0011 — Title poster shared-element morph

- **Status:** Accepted
- **Date:** 2026-08-06
- **Related:** [ADR-0004](ADR-0004-content-identity.md) (cold TMDb resolve under morph); Frontend Architecture / UI conventions (poster grids)
- **Implements in:** Shared-element title poster morph (PR #29); timing / cold-path harden (PR #36)

## Context

Opening a movie or TV title from a poster appears across library shelves, search, Similar, home rails, and guest discovery. A plain route change with a new hero image feels discontinuous. React View Transitions alone skip or fail on important paths (same-route Similar on a title page; cold TMDb resolve shells). The product needed one navigation language for every openable title poster.

## Decision

### Entry points (mandatory)

Any poster (or poster-sized control) that navigates to movie/TV title detail must use, in preference order:

1. **`TitleNavPoster`** — default for rails, grids, Similar, recommendations (warm UUID vs cold TMDb).
2. **`TitlePosterLink`** — when the catalog UUID is already known.
3. **`TmdbResolveLink`** — cold TMDb resolve wiring (usually via `TitleNavPoster`).

Do **not** pair raw `next/link` (or `<a>`) to `/movies/…` or `/tv/…` with `next/image` / `CatalogPoster` for an openable title poster. `CatalogPoster` remains display-only.

### Forward morph

- Click-time **FLIP** flight in `title-poster-flight.ts` / `title-poster-nav.ts` (not View Transitions alone).
- Duration token: `TITLE_POSTER_MORPH_MS` (750ms) — keep WAAPI flight in sync.
- Navigate with immediate `router.push` (do **not** wrap navigation in `startTransition` in a way that keeps the old page painted until RSC is ready while the flight finishes).
- Cold TMDb: push `/movies|tv/tmdb/{id}` immediately under the morph (provisional id); resolve warms the UUID cache in the background.
- Outgoing page may fade during flight; settle / abandon paths restore styles.

### Back morph

- Browser Back uses a global reverse FLIP (`TitlePosterBackMorph` + hero snapshot). No in-app back chevrons or per-page reverse morph reimplementation.

### Exempt

- Non-navigating posters (decorative mosaic, season stills without title navigation).
- Text links to title detail that are not poster morph sources.

## Alternatives considered

1. **React View Transitions only** — rejected as sole mechanism; skips or fails on same-route Similar and cold resolve shells.
2. **Per-page custom `router.push` + image clone** — rejected; drifts from shared FLIP/handoff and breaks Back morph consistency.
3. **Delay navigation until morph duration elapses (cold path)** — rejected; destination shell must appear under the flight.

## Consequences

- New UI with openable title posters starts from `TitleNavPoster` (or the two links above).
- Morph timing and cold-path push semantics are product-visible; changing them needs deliberate UX review.
- Guest discovery rails use the same morph entry points as signed-in surfaces.

## Future evolution

- Tune `TITLE_POSTER_MORPH_MS` only with visual QA across library → detail, Similar, and cold TMDb.
- Optional reduced-motion shortcut that skips FLIP while keeping the same routes.
