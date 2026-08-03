import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';

import { GuestLanding } from '@/components/guest-landing';
import { PosterMosaic } from '@/components/poster-mosaic';
import { SiteHeader } from '@/components/site-header';
import { TopMoviesRail } from '@/components/top-movies-rail';
import { upstreamApiBaseUrl } from '@/lib/api';
import { accessCookieName, refreshCookieName } from '@/lib/auth-cookies';
import { UPSTREAM_FETCH_TIMEOUT_MS } from '@/lib/bff-proxy';
import { fetchLandingPosterUrls, fetchTopMovies } from '@/lib/catalog';
import {
  applyTrustedClientIpHeaders,
  clientIpFromForwardedFor,
} from '@/lib/trusted-client-headers';

export const metadata: Metadata = {
  title: 'Aperture',
  description: 'A cinematic window into film and television.',
};

/**
 * Access-only session probe for the home shell.
 *
 * Never calls refresh from RSC (Next cannot persist rotated cookies here).
 * SiteHeader refreshes via `/api/auth/me` on the client.
 *
 * Matrix:
 * - no cookies → guest
 * - refresh-only → signed-in (intentional RSC optimism; SiteHeader recovers)
 * - /auth/me ok → signed-in
 * - 401 + refresh → signed-in; 401 without refresh → guest
 * - 5xx / timeout / network + refresh → signed-in; access-only → guest
 * - 429 + any auth cookie → signed-in; else guest
 * - config / baseUrl failure → signed-in only if refresh; access-only → guest
 */
async function shouldShowSignedInHome(): Promise<boolean> {
  const jar = await cookies();
  const access = jar.get(accessCookieName())?.value;
  const refresh = jar.get(refreshCookieName())?.value;

  if (!access && !refresh) {
    return false;
  }

  // Refresh-only: optimistic signed-in shell; SiteHeader will refresh.
  if (!access) {
    return true;
  }

  let base: string;
  try {
    base = upstreamApiBaseUrl();
  } catch {
    // Misconfigured API — keep signed-in shell only when refresh can recover.
    return Boolean(refresh);
  }

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
      return true;
    }
    if (res.status === 401) {
      return Boolean(refresh);
    }
    if (res.status === 429) {
      // Avoid demoting the shell solely because /me is rate-limited.
      return Boolean(access || refresh);
    }
    // 5xx (and other non-ok) — optimistic only when refresh can recover.
    return Boolean(refresh);
  } catch {
    // Network / timeout — optimistic only when refresh can recover.
    return Boolean(refresh);
  }
}

export default async function HomePage() {
  if (await shouldShowSignedInHome()) {
    const movies = await fetchTopMovies();
    return (
      <div className="shell-atmosphere relative flex min-h-dvh flex-col items-center py-16 sm:py-24">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <SiteHeader />
        <main
          id="main-content"
          className="layout-content motion-fade-rise relative z-[1] text-left"
        >
          <TopMoviesRail movies={movies} />
        </main>
      </div>
    );
  }

  const posters = await fetchLandingPosterUrls();
  return (
    <div className="shell-atmosphere relative flex min-h-dvh flex-col overflow-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <PosterMosaic posters={posters} />
      <SiteHeader />
      <main
        id="main-content"
        className="relative z-[1] flex flex-1 flex-col items-center justify-center px-5 py-12 sm:px-6 sm:py-24"
      >
        <GuestLanding />
      </main>
    </div>
  );
}
