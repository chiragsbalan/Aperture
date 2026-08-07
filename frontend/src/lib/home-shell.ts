/**
 * @fileoverview Signed-in vs guest home shell helpers for `/`.
 *
 * Access-only cookies must never prefetch catalog rails — `/me` may 401 and
 * demote to guest. Only a refresh cookie may start rail fetches in parallel
 * with the session probe. Guests always fetch rails on the `/` landing path.
 *
 * Display cap coupling: `HOME_RAIL_MAX_PUBLIC_LIMIT` in `catalog.ts` (24)
 * must stay aligned with backend `TOP_MOVIES_MAX_PUBLIC_LIMIT` /
 * `settings.top_movies_max_public_limit`. Authenticated browse shelves use
 * `HOME_RAIL_MAX_AUTH_LIMIT` (500) ↔ `TOP_MOVIES_MAX_AUTH_LIMIT`. Default FE
 * fetch limit 12 aligns with `top_movies_default_limit`.
 *
 * RSC cookie/`/me` probe lives in `home-shell.server.ts` so client modules
 * can import headings and pure helpers without `next/headers`.
 */

/** Outcome of the RSC `/auth/me` probe (or failure before a response). */
export type HomeShellMeOutcome =
  | 'ok'
  | 'unauthorized'
  | 'rate_limited'
  | 'other_http'
  | 'network'
  | 'config_error';

export interface DecideSignedInHomeShellArgs {
  hasAccess: boolean;
  hasRefresh: boolean;
  /**
   * Required when `hasAccess` is true (after the `/me` probe or a pre-fetch
   * failure). Ignored for refresh-only short-circuit.
   */
  outcome?: HomeShellMeOutcome;
}

/**
 * Pure home-shell matrix (no I/O).
 *
 * - no cookies → guest
 * - refresh-only (any outcome / before fetch) → signed-in (RSC optimism)
 * - access + ok → signed-in
 * - access + unauthorized / rate_limited / other_http / network /
 *   config_error → signed-in iff refresh (SiteHeader can recover via refresh;
 *   access-only demotes to guest)
 */
export function decideSignedInHomeShell({
  hasAccess,
  hasRefresh,
  outcome,
}: DecideSignedInHomeShellArgs): boolean {
  if (!hasAccess && !hasRefresh) {
    return false;
  }

  // Refresh-only: optimistic signed-in shell; SiteHeader will refresh.
  if (!hasAccess) {
    return true;
  }

  switch (outcome) {
    case 'ok':
      return true;
    case 'unauthorized':
    case 'rate_limited':
    case 'other_http':
    case 'network':
    case 'config_error':
      return hasRefresh;
    case undefined:
      return false;
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

/** Whether `/` may prefetch home rails before the session probe resolves. */
export function shouldPrefetchHomeRails(hasRefreshCookie: boolean): boolean {
  return hasRefreshCookie;
}

/** Rail headings for signed-in `/` and the guest landing on `/`. */
export const HOME_CATALOG_RAIL_HEADINGS = [
  'Now in theatres',
  'Top movies',
  'Top TV shows',
] as const;
