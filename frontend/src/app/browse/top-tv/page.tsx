import { BrowseShelfPage } from '@/components/browse-shelf-page';
import { accessCookieName } from '@/lib/auth-cookies';
import {
  fetchTopTvShows,
  HOME_RAIL_MAX_AUTH_LIMIT,
  HOME_RAIL_MAX_PUBLIC_LIMIT,
} from '@/lib/catalog';
import { HOME_CATALOG_RAIL_HEADINGS } from '@/lib/home-shell';
import { shouldShowSignedInHome } from '@/lib/home-shell.server';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';

export const metadata: Metadata = {
  title: 'Top TV shows · Aperture',
  description: "A rotating sample from TMDb's all-time top rated TV.",
};

export default async function BrowseTopTvPage() {
  const jar = await cookies();
  const access = jar.get(accessCookieName())?.value;
  const signedIn = await shouldShowSignedInHome();
  const result =
    signedIn && access
      ? await fetchTopTvShows(HOME_RAIL_MAX_AUTH_LIMIT, {
          accessToken: access,
        })
      : await fetchTopTvShows(HOME_RAIL_MAX_PUBLIC_LIMIT);
  const guestLimited = !result.authAccepted;

  return (
    <BrowseShelfPage
      title={HOME_CATALOG_RAIL_HEADINGS[2]}
      description={"A rotating sample from TMDb's all-time top rated TV."}
      emptyMessage="Top TV shows are unavailable right now. Try again shortly."
      items={result.items}
      kind="tv"
      guestLimited={guestLimited}
    />
  );
}
