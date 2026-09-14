import type { Metadata } from 'next';

import { GuestHomeShell } from '@/components/home-shell-views';
import { fetchHomeCatalogRails, fetchLandingPosterUrls } from '@/lib/catalog';

export const metadata: Metadata = {
  title: 'Aperture',
  description: 'A cinematic window into film and television.',
};

/**
 * Anonymous home only. A session cookie is rewritten to the signed-in shell
 * before this page runs, so this document can be reused for about a minute.
 *
 * Do not read cookies or request headers here. That opts the route out of
 * the public cache.
 */
export const revalidate = 60;

export default async function HomePage() {
  const [posters, rails] = await Promise.all([
    fetchLandingPosterUrls(),
    fetchHomeCatalogRails(),
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
