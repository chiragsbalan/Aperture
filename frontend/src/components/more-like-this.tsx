import { TitleNavPoster } from '@/components/title-nav-poster';
import type { SimilarTitle } from '@/lib/catalog';
import { POSTER_GRID_SIZES } from '@/lib/poster';

/**
 * Similar titles poster grid for the title-detail Similar panel.
 * Every openable poster uses ``TitleNavPoster`` (product-wide morph).
 */
export function MoreLikeThis({
  items,
  kind,
  limit = 6,
}: {
  items?: SimilarTitle[] | null;
  kind: 'movie' | 'tv_show';
  limit?: number;
}) {
  const visible = (items ?? []).slice(0, limit);
  if (visible.length === 0) {
    return (
      <p className="text-xs text-muted sm:text-sm">No similar titles yet.</p>
    );
  }

  return (
    <ul className="poster-grid">
      {visible.map((item) => {
        const resolvedType = item.content_type ?? kind;
        const navKind = resolvedType === 'tv_show' ? 'tv' : 'movie';
        const ariaLabel =
          item.year != null ? `${item.title} (${item.year})` : item.title;
        return (
          <li key={`${item.tmdb_id}-${item.title}`} className="min-w-0">
            <TitleNavPoster
              contentId={item.content_id}
              tmdbId={item.tmdb_id}
              kind={navKind}
              posterUrl={item.poster_url}
              posterAlt={item.title}
              ariaLabel={ariaLabel}
              className="block min-w-0 overflow-hidden transition hover:opacity-90"
              sizes={POSTER_GRID_SIZES}
            >
              <div className="poster-meta">
                <p className="mt-2 truncate font-display text-sm font-medium text-foreground">
                  {item.title}
                </p>
                {item.year != null ? (
                  <p className="truncate text-xs text-muted">{item.year}</p>
                ) : null}
              </div>
            </TitleNavPoster>
          </li>
        );
      })}
    </ul>
  );
}
