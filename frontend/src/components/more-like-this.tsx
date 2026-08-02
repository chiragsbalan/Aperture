import Link from 'next/link';

import { CatalogPoster } from '@/components/catalog-poster';
import { TmdbResolveLink } from '@/components/tmdb-resolve-link';
import type { SimilarTitle } from '@/lib/catalog';

/**
 * Similar titles row under the main detail column.
 * Missing catalog rows resolve via /movies|tv/tmdb/{tmdbId} on click.
 */
export function MoreLikeThis({
  items,
  kind,
  contentId,
}: {
  items?: SimilarTitle[] | null;
  kind: 'movie' | 'tv_show';
  contentId: string;
}) {
  const visible = (items ?? []).slice(0, 4);
  if (visible.length === 0) {
    return null;
  }

  const seeMoreHref =
    kind === 'tv_show'
      ? `/tv/${contentId}/similar`
      : `/movies/${contentId}/similar`;

  return (
    <section className="mt-8 w-full text-left sm:mt-10">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-border)] pb-2">
        <h2 className="font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
          Similar
        </h2>
        <Link
          href={seeMoreHref}
          aria-label="See all similar titles"
          className="shrink-0 text-sm text-muted underline-offset-2 transition hover:text-foreground hover:underline"
        >
          See all similar
        </Link>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4">
        {visible.map((item) => {
          const resolvedType = item.content_type ?? kind;
          if (item.content_id != null) {
            const href =
              resolvedType === 'tv_show'
                ? `/tv/${item.content_id}`
                : `/movies/${item.content_id}`;
            return (
              <li key={`${item.tmdb_id}-${item.title}`} className="min-w-0">
                <Link
                  href={href}
                  aria-label={item.title}
                  className="block transition hover:opacity-90"
                >
                  <CatalogPoster
                    url={item.poster_url}
                    alt={item.title}
                    sizes="(max-width: 640px) 45vw, 140px"
                  />
                </Link>
              </li>
            );
          }

          const href =
            resolvedType === 'tv_show'
              ? `/tv/tmdb/${item.tmdb_id}`
              : `/movies/tmdb/${item.tmdb_id}`;
          return (
            <li key={`${item.tmdb_id}-${item.title}`} className="min-w-0">
              <TmdbResolveLink
                href={href}
                tmdbId={item.tmdb_id}
                kind={resolvedType === 'tv_show' ? 'tv' : 'movie'}
                ariaLabel={item.title}
                className="block transition hover:opacity-90"
              >
                <CatalogPoster
                  url={item.poster_url}
                  alt={item.title}
                  sizes="(max-width: 640px) 45vw, 140px"
                />
              </TmdbResolveLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
