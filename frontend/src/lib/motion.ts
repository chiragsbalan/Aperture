/**
 * @fileoverview Shared motion durations for JS timers and inline styles.
 *
 * Color, type, radius, and other design tokens live in
 * `frontend/src/styles/tokens.css` (CSS variables / `.type-*` utilities).
 * Keep these millisecond values in sync with `--duration-*` there.
 * Prefer {@link MOTION_DURATION_MED_MS} / `--duration-med` for tab panels,
 * popups, overlays, and expand/collapse. Tablists must also use the sliding
 * `.title-tab-indicator` + panel crossfade pattern (see aperture-ui rule and
 * `title-meta-tabs.tsx` / `profile-nav.tsx` + `profile-tab-stage.tsx`).
 *
 * Size easing (height/width when those are explicitly set): use `.motion-size`
 * from `globals.css`. Horizontal overflow hints: `.scroll-fade-x` +
 * `useScrollFadeX` from `scroll-fade.ts`.
 *
 * Title poster open morph (product-wide): every openable movie/TV poster must
 * use `TitleNavPoster` (or `TitlePosterLink` / `TmdbResolveLink`). See
 * `title-poster-morph.ts` and `title-poster-flight.ts`.
 */

/** Micro interactions (hover color, small icon motion). */
export const MOTION_DURATION_FAST_MS = 160;

/**
 * Default UI motion — tab content, dialogs/popups, overlays, height easing.
 */
export const MOTION_DURATION_MED_MS = 450;

/** Page entrance and large atmospheric reveals. */
export const MOTION_DURATION_SLOW_MS = 900;
