import { BrowseShelfPage } from '@/components/browse-shelf-page';
import { fetchNowInTheatres, HOME_RAIL_MAX_PUBLIC_LIMIT } from '@/lib/catalog';
import { HOME_CATALOG_RAIL_HEADINGS } from '@/lib/home-shell';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Now in theatres · Aperture',
  description: 'Popular movies playing in theatres right now.',
};

export default async function BrowseNowInTheatresPage() {
  const items = await fetchNowInTheatres(HOME_RAIL_MAX_PUBLIC_LIMIT);
  return (
    <BrowseShelfPage
      title={HOME_CATALOG_RAIL_HEADINGS[0]}
      description="The most popular movies playing in theatres right now."
      emptyMessage="Now in theatres is unavailable right now. Try again shortly."
      items={items}
      kind="movie"
    />
  );
}
