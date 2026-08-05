/**
 * @fileoverview RSC-only home shell session probe (uses `next/headers`).
 */

import { cookies, headers } from 'next/headers';

import { upstreamApiBaseUrl } from '@/lib/api';
import { accessCookieName, refreshCookieName } from '@/lib/auth-cookies';
import { UPSTREAM_FETCH_TIMEOUT_MS } from '@/lib/bff-proxy';
import {
  decideSignedInHomeShell,
  type HomeShellMeOutcome,
} from '@/lib/home-shell';
import {
  applyTrustedClientIpHeaders,
  clientIpFromForwardedFor,
} from '@/lib/trusted-client-headers';

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
