import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  GuestHomeShell,
  SignedInHomeShell,
} from '@/components/home-shell-views';
import { refreshCookieName } from '@/lib/auth-cookies';
import { fetchHomeCatalogRails, fetchLandingPosterUrls } from '@/lib/catalog';
import { shouldPrefetchHomeRails } from '@/lib/home-shell';
import { shouldShowSignedInHome } from '@/lib/home-shell.server';
import { SIGNED_IN_HOME_HEADER } from '@/lib/signed-in-home';

export const metadata: Metadata = {
  title: 'Aperture',
  robots: { index: false, follow: false },
};

/** Never store this shell on the public home cache. */
export const dynamic = 'force-dynamic';

/**
 * Signed-in home, reached only by a middleware rewrite of ``/``.
 *
 * Same session matrix as before. A stale cookie that demotes to guest still
 * renders the landing here, so a leftover cookie cannot loop through ``/``.
 */
export default async function SignedInHomePage() {
  const headerStore = await headers();
  if (headerStore.get(SIGNED_IN_HOME_HEADER) !== '1') {
    redirect('/');
  }

  const jar = await cookies();
  const hasRefreshCookie = Boolean(jar.get(refreshCookieName())?.value);
  const railsPromise = shouldPrefetchHomeRails(hasRefreshCookie)
    ? fetchHomeCatalogRails({ forwardClientIp: true })
    : null;

  if (await shouldShowSignedInHome()) {
    const rails = await (railsPromise ??
      fetchHomeCatalogRails({ forwardClientIp: true }));
    return (
      <SignedInHomeShell
        inTheatres={rails.inTheatres}
        movies={rails.movies}
        shows={rails.shows}
      />
    );
  }

  const [posters, rails] = await Promise.all([
    fetchLandingPosterUrls(),
    railsPromise ?? fetchHomeCatalogRails({ forwardClientIp: true }),
  ]);
  return (
    <GuestHomeShell
      posters={posters}
      inTheatres={rails.inTheatres}
      movies={rails.movies}
      shows={rails.shows}
    />
  );
}
