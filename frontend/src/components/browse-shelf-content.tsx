'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { TitleShelfView } from '@/components/title-shelf-view';
import type { TopMovie } from '@/lib/catalog';
import {
  shelfItemsFromTopMovies,
  TITLE_SHELF_PAGE_SIZE,
} from '@/lib/title-shelf';

/**
 * Top movies / Top TV browse shelf body: guests see the public window + login
 * CTA; signed-in users get shelf Load more over a shuffled pool (max 500).
 */
export function BrowseShelfContent({
  title,
  description,
  emptyMessage,
  items,
  kind,
  guestLimited,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  items: TopMovie[];
  kind: 'movie' | 'tv';
  /** When true, show the public window only + login CTA (no Load more). */
  guestLimited: boolean;
}) {
  const allItems = shelfItemsFromTopMovies(items, kind);
  const [visibleCount, setVisibleCount] = useState(() =>
    guestLimited
      ? allItems.length
      : Math.min(TITLE_SHELF_PAGE_SIZE, allItems.length),
  );
  const prevGuestLimitedRef = useRef(guestLimited);

  useEffect(() => {
    const guestLimitedFlipped = prevGuestLimitedRef.current !== guestLimited;
    prevGuestLimitedRef.current = guestLimited;

    if (guestLimitedFlipped) {
      setVisibleCount(
        guestLimited
          ? allItems.length
          : Math.min(TITLE_SHELF_PAGE_SIZE, allItems.length),
      );
      return;
    }

    setVisibleCount((current) => {
      if (allItems.length < current) {
        return guestLimited
          ? allItems.length
          : Math.min(TITLE_SHELF_PAGE_SIZE, allItems.length);
      }
      return current;
    });
  }, [guestLimited, allItems.length]);

  const visibleItems = guestLimited
    ? allItems
    : allItems.slice(0, visibleCount);
  const hasMore = !guestLimited && visibleCount < allItems.length;

  return (
    <TitleShelfView
      title={title}
      description={description}
      emptyMessage={emptyMessage}
      status="ready"
      items={visibleItems}
      total={allItems.length}
      hasMore={hasMore}
      onLoadMore={
        hasMore
          ? () => {
              setVisibleCount((current) =>
                Math.min(current + TITLE_SHELF_PAGE_SIZE, allItems.length),
              );
            }
          : undefined
      }
      footer={
        guestLimited && allItems.length > 0 ? (
          <p className="mt-10 text-muted">
            <Link
              href="/login"
              className="text-foreground underline"
              aria-label="Log in to see more"
            >
              Log in
            </Link>{' '}
            to see more
          </p>
        ) : null
      }
    />
  );
}
