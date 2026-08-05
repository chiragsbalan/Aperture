/**
 * @fileoverview Signed-in vs guest home shell helpers for `/`.
 *
 * Access-only cookies must never prefetch catalog rails — `/me` may 401 and
 * demote to guest. Only a refresh cookie may start rail fetches in parallel
 * with the session probe. Guests always fetch rails on the `/` landing path.
 *
 * Display cap coupling: `HOME_RAIL_MAX_PUBLIC_LIMIT` in `catalog.ts` (24)
 * must stay aligned with backend `TOP_MOVIES_MAX_PUBLIC_LIMIT` /
 * `settings.top_movies_max_public_limit`. Default FE fetch limit 12 aligns
 * with `top_movies_default_limit`.
 */

import { cookies, headers } from 'next/headers';

import { upstreamApiBaseUrl } from '@/lib/api';
import { accessCookieName, refreshCookieName } from '@/lib/auth-cookies';
import { UPSTREAM_FETCH_TIMEOUT_MS } from '@/lib/bff-proxy';
import {
  applyTrustedClientIpHeaders,
  clientIpFromForwardedFor,
} from '@/lib/trusted-client-headers';

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

/**
 * RSC session probe for the `/` shell. Never calls refresh (Next cannot
 * persist rotated cookies here). SiteHeader refreshes via `/api/auth/me`.
 */
export async function shouldShowSignedInHome(): Promise<boolean> {
  const jar = await cookies();
  const access = jar.get(accessCookieName())?.value;
  const refresh = jar.get(refreshCookieName())?.value;
  const hasAccess = Boolean(access);
  const hasRefresh = Boolean(refresh);

  if (!hasAccess && !hasRefresh) {
    return decideSignedInHomeShell({ hasAccess: false, hasRefresh: false });
  }

  if (!hasAccess) {
    return decideSignedInHomeShell({ hasAccess: false, hasRefresh: true });
  }

  let base: string;
  try {
    base = upstreamApiBaseUrl();
  } catch {
    return decideSignedInHomeShell({
      hasAccess: true,
      hasRefresh,
      outcome: 'config_error',
    });
  }

  let outcome: HomeShellMeOutcome;
  try {
    const requestHeaders = new Headers({
      Accept: 'application/json',
      Authorization: `Bearer ${access}`,
    });
    const incoming = await headers();
    applyTrustedClientIpHeaders(
      requestHeaders,
      clientIpFromForwardedFor(incoming.get('x-forwarded-for')),
    );

    const res = await fetch(`${base}/api/v1/auth/me`, {
      cache: 'no-store',
      headers: requestHeaders,
      signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
    });

    if (res.ok) {
      outcome = 'ok';
    } else if (res.status === 401) {
      outcome = 'unauthorized';
    } else if (res.status === 429) {
      outcome = 'rate_limited';
    } else {
      outcome = 'other_http';
    }
  } catch {
    outcome = 'network';
  }

  return decideSignedInHomeShell({
    hasAccess: true,
    hasRefresh,
    outcome,
  });
}

/** Rail headings for signed-in `/` and the guest landing on `/`. */
export const HOME_CATALOG_RAIL_HEADINGS = [
  'Now in theatres',
  'Top movies',
  'Top TV shows',
] as const;
