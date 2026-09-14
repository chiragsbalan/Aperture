/**
 * Shared loading skeletons — shimmer bars/grids so navigation and client
 * fetches read as in-progress (not empty static chrome).
 *
 * Motion: ``.skeleton-pulse`` shimmer in globals.css (off under reduced-motion).
 * Soft App Router navigations also arm ``NavigationPending`` on link click.
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
      <div className="catalog-detail-hero">
        <SkeletonPoster className="catalog-detail-hero-art" />
        <div className="catalog-detail-hero-heading space-y-3 sm:space-y-4">
          <SkeletonBlock className="h-8 w-full max-w-[12rem] rounded-sm sm:h-10 sm:max-w-md" />
          <SkeletonBlock className="h-3 w-28 rounded-sm sm:h-4 sm:w-48" />
        </div>
        <div
          aria-hidden
          className="catalog-detail-hero-body space-y-2 sm:max-w-2xl"
        >
          <SkeletonBlock className="h-3 w-full rounded-sm sm:h-4" />
          <SkeletonBlock className="h-3 w-11/12 rounded-sm sm:h-4" />
          <SkeletonBlock className="h-3 w-4/5 rounded-sm sm:h-4" />
        </div>
      </div>
    </div>
  );
}

/** Person profile: same hero tracks + Known for posters + text filmography. */
export function PersonDetailSkeleton() {
  return (
    <div
      className="layout-content layout-shell-pad-top motion-fade-in relative z-[1] pb-16 sm:pb-24"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading person…</span>
      <div className="catalog-detail-hero">
        <SkeletonPoster className="catalog-detail-hero-art" />
        <div className="catalog-detail-hero-heading space-y-3 sm:space-y-4">
          <SkeletonBlock className="h-8 w-48 max-w-full rounded-sm sm:h-10 sm:w-72" />
          <SkeletonBlock className="h-3 w-28 rounded-sm" />
          <SkeletonBlock className="h-3 w-40 rounded-sm" />
        </div>
        <div className="catalog-detail-hero-body">
          <div className="space-y-2 sm:max-w-2xl">
            <SkeletonBlock className="h-3 w-full rounded-sm sm:h-4" />
            <SkeletonBlock className="h-3 w-11/12 rounded-sm sm:h-4" />
            <SkeletonBlock className="h-3 w-4/5 rounded-sm sm:h-4" />
          </div>
          <hr className="title-actions-rule" />
          <div className="mt-8 sm:mt-10">
            <div className="border-b border-[var(--color-border)] pb-2">
              <SkeletonBlock className="h-5 w-28 rounded-sm" />
            </div>
            <PosterGridSkeleton className="mt-4" count={12} />
          </div>
          <div className="mt-8 sm:mt-10">
            <div className="border-b border-[var(--color-border)] pb-2">
              <SkeletonBlock className="h-5 w-48 rounded-sm sm:w-72" />
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full space-y-1 sm:w-56">
                <SkeletonBlock className="h-3 w-20 rounded-sm" />
                <SkeletonBlock className="h-10 w-full rounded-[var(--radius-sm)]" />
              </div>
              <div className="w-full space-y-1 sm:w-56">
                <SkeletonBlock className="h-3 w-12 rounded-sm" />
                <SkeletonBlock className="h-10 w-full rounded-[var(--radius-sm)]" />
              </div>
            </div>
            <div className="mt-4" aria-hidden>
              <SkeletonBlock className="h-3 w-12 rounded-sm" />
              <ul className="mt-2 divide-y divide-[var(--color-border)]">
                {Array.from({ length: 6 }, (_, index) => (
                  <li
                    key={index}
                    className="flex items-baseline gap-3 py-3 sm:gap-4"
                  >
                    <SkeletonBlock className="h-3 w-10 shrink-0 rounded-sm" />
                    <SkeletonBlock className="h-3.5 w-40 max-w-[45%] rounded-sm sm:w-56" />
                    <SkeletonBlock className="ml-auto h-3 w-20 max-w-[30%] rounded-sm sm:w-28" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
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

export function ReviewsListSkeleton({
  count = 5,
}: {
  count?: number;
} = {}) {
  return (
    <ul className="space-y-6" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="space-y-3">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-32 max-w-[50%] rounded-sm" />
              <SkeletonBlock className="h-3 w-20 rounded-sm" />
            </div>
          </div>
          <SkeletonBlock className="h-12 w-full rounded-sm" />
        </li>
      ))}
    </ul>
  );
}

/** Title activity page: heading, tab strip, review rows. */
export function ActivityPageSkeleton() {
  return (
    <div
      className="layout-content motion-fade-in pb-16 text-left sm:pb-24"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading…</span>
      <SkeletonBlock className="h-8 w-56 max-w-full rounded-sm sm:h-9 sm:w-80" />
      <SkeletonBlock className="mt-2 h-3 w-16 rounded-sm" />
      <div className="mt-8 flex gap-6 border-b border-[var(--color-border)] pb-2 sm:mt-10">
        <SkeletonBlock className="h-4 w-20 rounded-sm" />
        <SkeletonBlock className="h-4 w-20 rounded-sm" />
        <SkeletonBlock className="h-4 w-16 rounded-sm" />
        <SkeletonBlock className="h-4 w-16 rounded-sm" />
      </div>
      <div className="mt-5">
        <ReviewsListSkeleton />
      </div>
    </div>
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
