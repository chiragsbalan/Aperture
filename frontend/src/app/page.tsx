import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { GuestLanding } from '@/components/guest-landing';
import { HomeCatalogRails } from '@/components/home-catalog-rails';
import { SiteHeader } from '@/components/site-header';
import { refreshCookieName } from '@/lib/auth-cookies';
import {
  fetchHomeCatalogRails,
  fetchLandingPosterUrls,
} from '@/lib/catalog';
import { shouldPrefetchHomeRails } from '@/lib/home-shell';
import { shouldShowSignedInHome } from '@/lib/home-shell.server';

export const metadata: Metadata = {
  title: 'Aperture',
  description: 'A cinematic window into film and television.',
};

/**
 * Access-only session probe for the home shell (see `decideSignedInHomeShell`).
 *
 * Never calls refresh from RSC (Next cannot persist rotated cookies here).
 * SiteHeader refreshes via shared AuthProvider → `/api/auth/me`.
 *
 * Matrix:
 * - no cookies → guest
 * - refresh-only → signed-in (intentional RSC optimism; SiteHeader recovers)
 * - access + /auth/me ok → signed-in
 * - access + 401 / 429 / 5xx / timeout / network / config → signed-in iff
 *   refresh (access-only demotes to guest; SiteHeader recovers via refresh)
 *
 * Prefetch is separate: refresh-gated only (`shouldPrefetchHomeRails`).
 */
export default async function HomePage() {
  const jar = await cookies();
  const hasRefreshCookie = Boolean(jar.get(refreshCookieName())?.value);

  // Prefetch rails only when refresh is present. Access-only must never start
  // rail fetches — /me may 401 and demote to guest (guest path fetches rails).
  const railsPromise = shouldPrefetchHomeRails(hasRefreshCookie)
    ? fetchHomeCatalogRails()
    : null;

  // Always resolve the session probe before choosing the shell.
  if (await shouldShowSignedInHome()) {
    const rails = await (railsPromise ?? fetchHomeCatalogRails());
    return (
      <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col items-center">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main-content" className="relative z-[1] w-full">
          <HomeCatalogRails
            inTheatres={rails.inTheatres}
            movies={rails.movies}
            shows={rails.shows}
          />
        </main>
      </div>
    );
  }

  const [posters, rails] = await Promise.all([
    fetchLandingPosterUrls(),
    fetchHomeCatalogRails(),
  ]);

  return (
    <div className="relative flex min-h-svh flex-col bg-[var(--color-bg)]">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative flex flex-1 flex-col">
        <GuestLanding
          posters={posters}
          inTheatres={rails.inTheatres}
          movies={rails.movies}
          shows={rails.shows}
        />
      </main>
    </div>
  );
}
