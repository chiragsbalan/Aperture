import Link from 'next/link';

import { TitleNavPoster } from '@/components/title-nav-poster';
import type { SimilarTitle } from '@/lib/catalog';
import { POSTER_GRID_SIZES } from '@/lib/poster';

/**
 * Similar titles row under the main detail column.
 * Every openable poster uses ``TitleNavPoster`` (product-wide morph).
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
  const visible = (items ?? []).slice(0, 6);
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
        <h2 className="type-section text-foreground">Similar</h2>
        <Link
          href={seeMoreHref}
          aria-label="See all similar titles"
          className="shrink-0 text-sm text-muted underline-offset-2 transition hover:text-foreground hover:underline"
        >
          See all similar
        </Link>
      </div>
      <ul className="poster-grid mt-4">
        {visible.map((item) => {
          const resolvedType = item.content_type ?? kind;
          const navKind = resolvedType === 'tv_show' ? 'tv' : 'movie';
          return (
            <li key={`${item.tmdb_id}-${item.title}`} className="min-w-0">
              <TitleNavPoster
                contentId={item.content_id}
                tmdbId={item.tmdb_id}
                kind={navKind}
                posterUrl={item.poster_url}
                posterAlt={item.title}
                ariaLabel={item.title}
                className="block min-w-0 overflow-hidden transition hover:opacity-90"
                sizes={POSTER_GRID_SIZES}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
