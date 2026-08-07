'use client';

import { useEffect, useRef } from 'react';

import { PosterGridSkeleton } from '@/components/skeleton';
import { TITLE_SHELF_PRIORITY_COUNT } from '@/lib/title-shelf';

/** One desktop poster row of placeholders while the next page loads. */
function LoadMoreSkeletonRow() {
  return <PosterGridSkeleton count={TITLE_SHELF_PRIORITY_COUNT} className="" />;
}

/**
 * Auto-loads the next shelf page when the sentinel nears the viewport.
 * Parents must set ``loadingMore`` while a fetch/expand is in flight so the
 * observer does not re-fire in a tight loop.
 */
export function ShelfInfiniteScroll({
  hasMore,
  loadingMore,
  onLoadMore,
  statusText,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Optional sr-only progress (e.g. "Showing 24 of 120"). */
  statusText?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!hasMore || loadingMore) {
      return;
    }

    const node = sentinelRef.current;
    if (node == null) {
      return;
    }

    const tryLoad = () => {
      onLoadMoreRef.current();
    };

    // Still near the bottom after a page lands — chain the next fetch.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight + 280) {
      tryLoad();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        tryLoad();
      },
      { root: null, rootMargin: '280px 0px', threshold: 0 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadingMore]);

  if (!hasMore) {
    return null;
  }

  return (
    <div
      ref={sentinelRef}
      className="mt-10"
      aria-busy={loadingMore || undefined}
    >
      {statusText ? (
        <span className="sr-only" role="status" aria-live="polite">
          {statusText}
        </span>
      ) : null}
      {loadingMore ? (
        <>
          <span className="sr-only" role="status" aria-live="polite">
            Loading more titles…
          </span>
          <LoadMoreSkeletonRow />
        </>
      ) : (
        <div className="h-8" aria-hidden />
      )}
    </div>
  );
}
