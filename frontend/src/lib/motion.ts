/**
 * @fileoverview Shared motion durations for JS timers and inline styles.
 *
 * Color, type, radius, and other design tokens live in
 * `frontend/src/styles/tokens.css` (CSS variables / `.type-*` utilities).
 * Keep these millisecond values in sync with `--duration-*` there.
 * Prefer {@link MOTION_DURATION_MED_MS} / `--duration-med` for tab panels,
 * popups, overlays, and expand/collapse.
 */

/** Micro interactions (hover color, small icon motion). */
export const MOTION_DURATION_FAST_MS = 160;

/**
 * Default UI motion — tab content, dialogs/popups, overlays, height easing.
 */
export const MOTION_DURATION_MED_MS = 450;

/** Page entrance and large atmospheric reveals. */
export const MOTION_DURATION_SLOW_MS = 900;
