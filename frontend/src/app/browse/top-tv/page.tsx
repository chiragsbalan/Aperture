import { BrowseShelfPage } from '@/components/browse-shelf-page';
import { fetchTopTvShows, HOME_RAIL_MAX_PUBLIC_LIMIT } from '@/lib/catalog';
import { HOME_CATALOG_RAIL_HEADINGS } from '@/lib/home-shell';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Top TV shows · Aperture',
  description: "A rotating sample from TMDb's all-time top rated TV.",
};

export default async function BrowseTopTvPage() {
  const items = await fetchTopTvShows(HOME_RAIL_MAX_PUBLIC_LIMIT);
  return (
    <BrowseShelfPage
      title={HOME_CATALOG_RAIL_HEADINGS[2]}
      description={"A rotating sample from TMDb's all-time top rated TV."}
      emptyMessage="Top TV shows are unavailable right now. Try again shortly."
      items={items}
      kind="tv"
    />
  );
}
