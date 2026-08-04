'use client';

import { CatalogPoster } from '@/components/catalog-poster';
import { StarRating } from '@/components/star-rating';
import { TitlePosterLink } from '@/components/title-poster-link';
import { formatDiaryDayLabel } from '@/lib/diary';
import { hrefForLibraryContent, type WatchEntry } from '@/lib/library';

interface DiaryEntryCardProps {
  entry: WatchEntry;
  /**
   * When set (owner diary), poster + meta open the log detail sheet.
   * Visitors omit this — poster navigates to the title.
   */
  onOpen?: (entry: WatchEntry) => void;
  /** True while this card is animating out after delete. */
  leaving?: boolean;
}

/**
 * Diary watch: poster with review + date to the right, optional stars below.
 */
export function DiaryEntryCard({
  entry,
  onOpen,
  leaving = false,
}: DiaryEntryCardProps) {
  const dayLabel = formatDiaryDayLabel(entry.watched_at);
  const hasNote = entry.note != null && entry.note.trim() !== '';
  const interactive = onOpen != null;
  const titleLabel =
    entry.content.year != null
      ? `${entry.content.title} (${entry.content.year})`
      : entry.content.title;

  const meta = (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {hasNote ? (
          <p className="min-w-0 text-sm text-foreground">{entry.note}</p>
        ) : (
          <p className="min-w-0 text-sm text-muted">{entry.content.title}</p>
        )}
        <time
          dateTime={entry.watched_at}
          className="shrink-0 text-xs text-muted"
        >
          {dayLabel}
        </time>
      </div>
      <div className="mt-1.5">
        <StarRating rating={entry.rating} />
      </div>
    </>
  );

  return (
    <li
      className={['diary-entry-item min-w-0', leaving ? 'is-leaving' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {interactive ? (
        <button
          type="button"
          className="flex w-full gap-3 rounded-[var(--radius-sm)] text-left outline-none transition hover:bg-[var(--color-fg)]/[0.03] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
          onClick={() => {
            onOpen(entry);
          }}
          aria-label={`Open log for ${titleLabel}`}
        >
          <div className="w-16 shrink-0 overflow-hidden sm:w-20">
            <CatalogPoster
              url={entry.content.poster_url}
              alt=""
              sizes="80px"
              className="w-full"
            />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">{meta}</div>
        </button>
      ) : (
        <div className="flex gap-3">
          <TitlePosterLink
            href={hrefForLibraryContent(entry.content)}
            contentId={entry.content.id}
            posterUrl={entry.content.poster_url}
            posterAlt={`${entry.content.title} poster`}
            ariaLabel={titleLabel}
            sizes="80px"
            className="block w-16 shrink-0 overflow-hidden transition hover:opacity-90 sm:w-20"
          />
          <div className="min-w-0 flex-1 pt-0.5">{meta}</div>
        </div>
      )}
    </li>
  );
}
