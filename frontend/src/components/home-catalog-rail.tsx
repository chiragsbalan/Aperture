import { TitleNavPoster } from '@/components/title-nav-poster';
import type { TopMovie } from '@/lib/catalog';
import { POSTER_GRID_SIZES } from '@/lib/poster';

interface HomeCatalogRailProps {
  /** Section heading id (unique on the page). */
  headingId: string;
  title: string;
  description: string;
  emptyMessage: string;
  items: TopMovie[];
  kind: 'movie' | 'tv';
  /** First home rail owns the page h1; later rails use h2. */
  headingLevel?: 'h1' | 'h2';
}

/**
 * Signed-in home poster rail (now in theatres / top movies / top TV).
 */
export function HomeCatalogRail({
  headingId,
  title,
  description,
  emptyMessage,
  items,
  kind,
  headingLevel = 'h2',
}: HomeCatalogRailProps) {
  const HeadingTag = headingLevel;

  return (
    <section className="w-full text-left" aria-labelledby={headingId}>
      <div className="border-b border-[var(--color-border)] pb-2">
        <HeadingTag id={headingId} className="type-rail text-foreground">
          {title}
        </HeadingTag>
        {items.length === 0 ? null : (
          <p className="mt-1 text-sm text-muted">{description}</p>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-5 text-sm text-muted sm:mt-6" role="status">
          {emptyMessage}
        </p>
      ) : (
        <ul className="poster-grid mt-5 sm:mt-6">
          {items.map((item) => (
            <li key={`${kind}:${item.tmdb_id}`} className="min-w-0">
              <TitleNavPoster
                tmdbId={item.tmdb_id}
                kind={kind}
                ariaLabel={
                  item.year != null
                    ? `${item.title} (${item.year})`
                    : item.title
                }
                className="block min-w-0 overflow-hidden transition hover:opacity-90"
                posterUrl={item.poster_url}
                posterAlt=""
                sizes={POSTER_GRID_SIZES}
              >
                <div className="poster-meta">
                  <p className="mt-2 block w-full truncate font-display text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  {item.year != null ? (
                    <p className="truncate text-xs text-muted">{item.year}</p>
                  ) : null}
                </div>
              </TitleNavPoster>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
