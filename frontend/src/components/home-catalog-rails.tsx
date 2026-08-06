import { HomeCatalogRail } from '@/components/home-catalog-rail';
import type { TopMovie } from '@/lib/catalog';
import { HOME_CATALOG_RAIL_HEADINGS } from '@/lib/home-shell';
import { BROWSE_SHELF_ROUTES } from '@/lib/title-shelf';

interface HomeCatalogRailsProps {
  inTheatres: TopMovie[];
  movies: TopMovie[];
  shows: TopMovie[];
  /** Guest landing already has a page h1 — use h2 for the first rail. */
  firstHeadingLevel?: 'h1' | 'h2';
}

/**
 * Shared Now in theatres / Top movies / Top TV rails for signed-in `/` and
 * the guest landing on `/`.
 */
export function HomeCatalogRails({
  inTheatres,
  movies,
  shows,
  firstHeadingLevel = 'h1',
}: HomeCatalogRailsProps) {
  const [theatresHeading, moviesHeading, showsHeading] =
    HOME_CATALOG_RAIL_HEADINGS;

  return (
    <div className="layout-content motion-fade-rise relative z-[1] space-y-12 text-left sm:space-y-16">
      <HomeCatalogRail
        headingId="now-in-theatres-heading"
        headingLevel={firstHeadingLevel}
        title={theatresHeading}
        description="The most popular movies playing in theatres right now."
        emptyMessage="Now in theatres is unavailable right now. Try again shortly."
        items={inTheatres}
        kind="movie"
        seeAllHref={BROWSE_SHELF_ROUTES.nowInTheatres}
      />
      <HomeCatalogRail
        headingId="top-movies-heading"
        title={moviesHeading}
        description={"A rotating sample from TMDb's all-time top rated."}
        emptyMessage="Top movies are unavailable right now. Try again shortly."
        items={movies}
        kind="movie"
        seeAllHref={BROWSE_SHELF_ROUTES.topMovies}
      />
      <HomeCatalogRail
        headingId="top-tv-shows-heading"
        title={showsHeading}
        description={"A rotating sample from TMDb's all-time top rated TV."}
        emptyMessage="Top TV shows are unavailable right now. Try again shortly."
        items={shows}
        kind="tv"
        seeAllHref={BROWSE_SHELF_ROUTES.topTv}
      />
    </div>
  );
}
