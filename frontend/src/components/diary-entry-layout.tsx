import { CatalogPoster } from '@/components/catalog-poster';
import { StarRating } from '@/components/star-rating';
import { formatDiaryDayLabel } from '@/lib/diary';
import type { WatchEntry } from '@/lib/library';

/**
 * Shared diary log layout: poster left, review + day date + stars right.
 */
export function DiaryEntryLayout({ entry }: { entry: WatchEntry }) {
  const dayLabel = formatDiaryDayLabel(entry.watched_at);
  const hasNote = entry.note != null && entry.note.trim() !== '';

  return (
    <div className="flex gap-3">
      <div className="w-16 shrink-0 overflow-hidden sm:w-20">
        <CatalogPoster
          url={entry.content.poster_url}
          alt={`${entry.content.title} poster`}
          sizes="80px"
          className="w-full"
        />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-medium text-foreground">
          {entry.content.title}
          {entry.content.year != null ? (
            <span className="font-normal text-muted">
              {' '}
              ({entry.content.year})
            </span>
          ) : null}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {hasNote ? (
            <p className="min-w-0 text-sm text-foreground">{entry.note}</p>
          ) : null}
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
      </div>
    </div>
  );
}
