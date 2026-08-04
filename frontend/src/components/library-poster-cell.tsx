'use client';

import { SharedTitlePoster } from '@/components/shared-title-poster';
import { TitlePosterLink } from '@/components/title-poster-link';
import { hrefForLibraryContent, type LibraryListItem } from '@/lib/library';
import { POSTER_GRID_SIZES } from '@/lib/poster';

function RemoveMarkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Poster grid cell for library / custom lists.
 * Browse: morph link. Edit mode: non-navigating poster + remove control.
 */
export function LibraryPosterCell({
  item,
  editing,
  removePending,
  onRemove,
}: {
  item: LibraryListItem;
  editing: boolean;
  removePending?: boolean;
  onRemove?: () => void;
}) {
  const label =
    item.content.year != null
      ? `${item.content.title} (${item.content.year})`
      : item.content.title;
  const meta = (
    <div className="poster-meta">
      <p className="mt-2 truncate font-display text-sm font-medium text-foreground">
        {item.content.title}
      </p>
      {item.content.year != null ? (
        <p className="truncate text-xs text-muted">{item.content.year}</p>
      ) : null}
    </div>
  );

  if (!editing) {
    return (
      <TitlePosterLink
        href={hrefForLibraryContent(item.content)}
        contentId={item.content.id}
        posterUrl={item.content.poster_url}
        posterAlt={`${item.content.title} poster`}
        ariaLabel={label}
        sizes={POSTER_GRID_SIZES}
        className="block min-w-0 overflow-hidden transition hover:opacity-90"
      >
        {meta}
      </TitlePosterLink>
    );
  }

  return (
    <div className="min-w-0">
      <div className="relative">
        <SharedTitlePoster
          contentId={item.content.id}
          url={item.content.poster_url}
          alt={`${item.content.title} poster`}
          sizes={POSTER_GRID_SIZES}
        />
        <button
          type="button"
          disabled={removePending}
          aria-label={`Remove ${item.content.title}`}
          aria-busy={removePending}
          className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(12,11,9,0.82)] text-foreground shadow-sm ring-1 ring-[var(--color-border)] transition hover:bg-[var(--color-danger)] hover:text-[var(--color-accent-contrast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:opacity-40"
          onClick={() => {
            onRemove?.();
          }}
        >
          <RemoveMarkIcon />
        </button>
      </div>
      {meta}
    </div>
  );
}
