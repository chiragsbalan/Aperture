import { TitleNavPoster } from '@/components/title-nav-poster';
import type { PersonTitleCard } from '@/lib/catalog';
import { POSTER_GRID_SIZES } from '@/lib/poster';

/**
 * Server-curated Known for poster grid under the person overview hairline.
 * Order comes from the API; hide when empty. No FormSelects or poster-meta.
 */
export function PersonKnownFor({
  items,
}: {
  items?: PersonTitleCard[] | null;
}) {
  const visible = items ?? [];
  if (visible.length === 0) {
    return null;
  }

  return (
    <section className="mt-8 w-full text-left sm:mt-10">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-border)] pb-2">
        <h2 className="type-section text-foreground">Known for</h2>
      </div>
      <ul className="poster-grid mt-4">
        {visible.map((item, index) => {
          const creditBits = [item.character, item.job].filter(Boolean);
          const ariaLabel =
            creditBits.length > 0
              ? `${item.title} (${creditBits.join(', ')})`
              : item.title;
          return (
            <li
              key={`${item.type}-${item.content_id ?? item.tmdb_id}-${item.credit_kind ?? ''}-${item.job ?? ''}-${item.character ?? ''}-${index}`}
              className="min-w-0"
            >
              <TitleNavPoster
                contentId={item.content_id}
                tmdbId={item.tmdb_id}
                kind={item.type}
                posterUrl={item.poster_url}
                posterAlt={`${item.title} poster`}
                ariaLabel={ariaLabel}
                className="block min-w-0 overflow-hidden transition hover:opacity-90"
                sizes={POSTER_GRID_SIZES}
                priority={index < 6}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
