/**
 * Shared loading skeletons — soft pulse bars/grids so navigation and client
 * fetches read as in-progress (not empty static chrome).
 *
 * Motion: ``.skeleton-pulse`` in globals.css (disabled under reduced-motion).
 */

import {
  TITLE_SHELF_PAGE_SIZE,
  TITLE_SHELF_PRIORITY_COUNT,
} from '@/lib/title-shelf';

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton-pulse ${className}`} />;
}

export function SkeletonPoster({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`skeleton-pulse aspect-[2/3] w-full rounded-[var(--radius-sm)] ${className}`}
    />
  );
}

/** Poster grid used by shelves, library lists, browse, similar, search. */
export function PosterGridSkeleton({
  count = TITLE_SHELF_PAGE_SIZE,
  className = 'mt-10',
}: {
  count?: number;
  className?: string;
} = {}) {
  return (
    <ul className={`poster-grid ${className}`.trim()} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="min-w-0">
          <SkeletonPoster />
          <div className="poster-meta mt-2 space-y-1">
            <SkeletonBlock className="h-3.5 w-[80%] rounded-sm" />
            <SkeletonBlock className="h-3 w-[33%] rounded-sm" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Horizontal home rail placeholders (3 rails). */
export function HomeRailsSkeleton() {
  return (
    <div
      className="layout-content layout-shell-pad-top space-y-10 pb-16 sm:space-y-14 sm:pb-24"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading…</span>
      {Array.from({ length: 3 }, (_, rail) => (
        <section key={rail} className="w-full text-left" aria-hidden>
          <div className="border-b border-[var(--color-border)] pb-2">
            <SkeletonBlock className="h-5 w-40 rounded-sm sm:w-52" />
            <SkeletonBlock className="mt-2 h-3 w-56 rounded-sm sm:w-72" />
          </div>
          <ul className="mt-5 flex gap-3 overflow-hidden sm:mt-6 sm:gap-4">
            {Array.from({ length: TITLE_SHELF_PRIORITY_COUNT }, (_, index) => (
              <li key={index} className="w-[6.75rem] shrink-0 sm:w-36">
                <SkeletonPoster />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Title / person detail hero + copy bars. */
export function DetailHeroSkeleton({
  className = 'layout-content layout-shell-pad-top motion-fade-in relative z-[1] pb-16 sm:pb-24',
}: {
  className?: string;
} = {}) {
  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading…</span>
      <div className="grid grid-cols-[minmax(0,1fr)_6.75rem] gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,1fr)_18rem] sm:gap-x-12 sm:gap-y-0">
        <SkeletonPoster className="col-start-2 row-span-2 row-start-1 sm:mt-10" />
        <div className="col-start-1 row-span-2 row-start-1 flex min-w-0 flex-col justify-center space-y-3 py-0.5 sm:row-span-1 sm:justify-start sm:space-y-4 sm:py-0">
          <SkeletonBlock className="h-8 w-full max-w-[12rem] rounded-sm sm:h-10 sm:max-w-md" />
          <SkeletonBlock className="h-3 w-28 rounded-sm sm:h-4 sm:w-48" />
        </div>
        <div
          aria-hidden
          className="col-span-2 col-start-1 row-start-3 space-y-2 sm:col-span-1 sm:row-start-2 sm:mt-8 sm:max-w-2xl"
        >
          <SkeletonBlock className="h-3 w-full rounded-sm sm:h-4" />
          <SkeletonBlock className="h-3 w-11/12 rounded-sm sm:h-4" />
          <SkeletonBlock className="h-3 w-4/5 rounded-sm sm:h-4" />
        </div>
      </div>
    </div>
  );
}

/** Named shelf page: title line + poster grid. */
export function ShelfPageSkeleton({
  showDescription = true,
}: {
  showDescription?: boolean;
} = {}) {
  return (
    <div
      className="layout-content motion-fade-rise text-left"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading…</span>
      <SkeletonBlock className="h-8 w-48 rounded-sm sm:h-9 sm:w-64" />
      {showDescription ? (
        <SkeletonBlock className="mt-3 h-3 w-72 max-w-full rounded-sm" />
      ) : null}
      <PosterGridSkeleton />
    </div>
  );
}

/** Library tab body under heading + LibraryNav. */
export function LibraryBodySkeleton({
  variant = 'grid',
}: {
  variant?: 'grid' | 'list' | 'diary';
}) {
  if (variant === 'list') {
    return <ListRowsSkeleton className="mt-10" />;
  }
  if (variant === 'diary') {
    return <DiaryCardsSkeleton className="mt-10" />;
  }
  return <PosterGridSkeleton />;
}

export function ListRowsSkeleton({
  rows = 6,
  className = 'mt-6',
}: {
  rows?: number;
  className?: string;
} = {}) {
  return (
    <ul
      className={`space-y-0 divide-y divide-[var(--color-border)] border-b border-t border-[var(--color-border)] ${className}`.trim()}
      aria-hidden
    >
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex items-center gap-3 py-4">
          <SkeletonBlock className="h-4 w-40 max-w-[50%] rounded-sm sm:w-56" />
          <SkeletonBlock className="ml-auto h-3 w-16 rounded-sm" />
        </li>
      ))}
    </ul>
  );
}

export function DiaryCardsSkeleton({
  count = 6,
  className = 'mt-6',
}: {
  count?: number;
  className?: string;
} = {}) {
  return (
    <div className={className} aria-hidden>
      <SkeletonBlock className="mb-4 h-4 w-32 rounded-sm" />
      <ul className="diary-entry-grid">
        {Array.from({ length: count }, (_, index) => (
          <li key={index} className="min-w-0">
            <SkeletonPoster />
            <div className="mt-2 space-y-1">
              <SkeletonBlock className="h-3.5 w-[85%] rounded-sm" />
              <SkeletonBlock className="h-3 w-1/2 rounded-sm" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SearchResultsSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Searching…</span>
      <PosterGridSkeleton className="mt-0" count={TITLE_SHELF_PRIORITY_COUNT} />
      <div className="mt-10 space-y-3" aria-hidden>
        <SkeletonBlock className="h-4 w-28 rounded-sm" />
        <ListRowsSkeleton rows={3} className="mt-0" />
      </div>
    </div>
  );
}

export function FormSkeleton({
  rows = 5,
  className = 'mt-8',
}: {
  rows?: number;
  className?: string;
} = {}) {
  return (
    <div
      className={`space-y-6 ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-2" aria-hidden>
          <SkeletonBlock className="h-3 w-24 rounded-sm" />
          <SkeletonBlock className="h-10 w-full max-w-md rounded-[var(--radius-sm)]" />
        </div>
      ))}
    </div>
  );
}

export function ProfileHeaderSkeleton() {
  return (
    <div className="mt-8" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading profile…</span>
      <div className="flex items-start gap-4" aria-hidden>
        <SkeletonBlock className="h-20 w-20 shrink-0 rounded-full sm:h-24 sm:w-24" />
        <div className="min-w-0 flex-1 space-y-3 pt-1">
          <SkeletonBlock className="h-7 w-40 rounded-sm sm:w-56" />
          <SkeletonBlock className="h-3 w-28 rounded-sm" />
          <SkeletonBlock className="h-3 w-full max-w-md rounded-sm" />
          <div className="flex flex-wrap gap-4 pt-1">
            <SkeletonBlock className="h-3 w-16 rounded-sm" />
            <SkeletonBlock className="h-3 w-16 rounded-sm" />
            <SkeletonBlock className="h-3 w-16 rounded-sm" />
          </div>
        </div>
      </div>
      <div
        className="mt-8 flex gap-4 border-b border-[var(--color-border)] pb-2"
        aria-hidden
      >
        <SkeletonBlock className="h-4 w-16 rounded-sm" />
        <SkeletonBlock className="h-4 w-20 rounded-sm" />
        <SkeletonBlock className="h-4 w-14 rounded-sm" />
        <SkeletonBlock className="h-4 w-16 rounded-sm" />
      </div>
      <PosterGridSkeleton className="mt-8" count={TITLE_SHELF_PRIORITY_COUNT} />
    </div>
  );
}
