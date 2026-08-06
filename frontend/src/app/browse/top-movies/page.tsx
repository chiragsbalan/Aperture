import { BrowseShelfPage } from '@/components/browse-shelf-page';
import { fetchTopMovies, HOME_RAIL_MAX_PUBLIC_LIMIT } from '@/lib/catalog';
import { HOME_CATALOG_RAIL_HEADINGS } from '@/lib/home-shell';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Top movies · Aperture',
  description: "A rotating sample from TMDb's all-time top rated movies.",
};

export default async function BrowseTopMoviesPage() {
  const items = await fetchTopMovies(HOME_RAIL_MAX_PUBLIC_LIMIT);
  return (
    <BrowseShelfPage
      title={HOME_CATALOG_RAIL_HEADINGS[1]}
      description={"A rotating sample from TMDb's all-time top rated."}
      emptyMessage="Top movies are unavailable right now. Try again shortly."
      items={items}
      kind="movie"
    />
  );
}
