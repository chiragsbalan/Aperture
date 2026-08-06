import { BrowseShelfPage } from '@/components/browse-shelf-page';
import { accessCookieName } from '@/lib/auth-cookies';
import {
  fetchTopMovies,
  HOME_RAIL_MAX_AUTH_LIMIT,
  HOME_RAIL_MAX_PUBLIC_LIMIT,
} from '@/lib/catalog';
import { HOME_CATALOG_RAIL_HEADINGS } from '@/lib/home-shell';
import { shouldShowSignedInHome } from '@/lib/home-shell.server';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';

export const metadata: Metadata = {
  title: 'Top movies · Aperture',
  description: "A rotating sample from TMDb's all-time top rated movies.",
};

export default async function BrowseTopMoviesPage() {
  const jar = await cookies();
  const access = jar.get(accessCookieName())?.value;
  const signedIn = await shouldShowSignedInHome();
  const result =
    signedIn && access
      ? await fetchTopMovies(HOME_RAIL_MAX_AUTH_LIMIT, {
          accessToken: access,
        })
      : await fetchTopMovies(HOME_RAIL_MAX_PUBLIC_LIMIT);
  const guestLimited = !result.authAccepted;

  return (
    <BrowseShelfPage
      title={HOME_CATALOG_RAIL_HEADINGS[1]}
      description={"A rotating sample from TMDb's all-time top rated."}
      emptyMessage="Top movies are unavailable right now. Try again shortly."
      items={result.items}
      kind="movie"
      guestLimited={guestLimited}
    />
  );
}
