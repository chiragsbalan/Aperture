'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ProfileAvatar } from '@/components/profile-avatar';
import { StarRating } from '@/components/star-rating';
import { ReviewsListSkeleton } from '@/components/skeleton';
import { formatIsoMonthYear } from '@/lib/iso_date';
import { toLibraryContentType } from '@/lib/library';
import {
  fetchTitleRatings,
  TITLE_REVIEWS_INLINE_LIMIT,
  type TitleRating,
} from '@/lib/reviews';

export function TitleRatings({
  contentType,
  contentId,
  onMetaChange,
}: {
  contentType: string;
  contentId: string;
  onMetaChange?: (meta: { total: number; ready: boolean }) => void;
}) {
  const kind = toLibraryContentType(contentType);
  const [items, setItems] = useState<TitleRating[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind == null) {
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);

    async function load() {
      const titleKind = kind as NonNullable<typeof kind>;
      const result = await fetchTitleRatings(titleKind, contentId, {
        page: 1,
        limit: TITLE_REVIEWS_INLINE_LIMIT,
        sort: 'highest',
      });
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setStatus('error');
        setError(result.error);
        return;
      }
      setItems(result.data.items);
      setTotal(result.data.total);
      setStatus('ready');
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [kind, contentId]);

  const ratingsReady = status === 'ready';

  useEffect(() => {
    if (onMetaChange == null) {
      return;
    }
    onMetaChange({
      total,
      ready: ratingsReady,
    });
  }, [onMetaChange, total, ratingsReady]);

  if (kind == null) {
    return null;
  }

  const inlineItems = items.slice(0, TITLE_REVIEWS_INLINE_LIMIT);

  return (
    <div>
      {status === 'loading' ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading ratings…</span>
          <ReviewsListSkeleton count={5} />
        </div>
      ) : null}

      {status === 'error' ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error ?? 'Could not load ratings.'}
        </p>
      ) : null}

      {status === 'ready' && inlineItems.length === 0 ? (
        <p className="text-xs text-muted sm:text-sm">No ratings yet.</p>
      ) : null}

      {status === 'ready' && inlineItems.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)]">
          {inlineItems.map((row) => {
            const displayName =
              row.author.display_name?.trim() || `@${row.author.username}`;
            const dateLabel = formatIsoMonthYear(row.watched_at);
            return (
              <li key={row.author.username} className="py-4 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Link
                    href={`/u/${encodeURIComponent(row.author.username)}`}
                    className="inline-flex min-w-0 items-center gap-2 text-foreground underline decoration-[var(--color-border)] underline-offset-4 transition hover:decoration-accent"
                  >
                    <ProfileAvatar
                      username={row.author.username}
                      displayName={row.author.display_name}
                      avatarUrl={row.author.avatar_url}
                      size="sm"
                    />
                    <span className="truncate">{displayName}</span>
                  </Link>
                  <StarRating rating={row.rating} />
                  {dateLabel != null ? (
                    <time
                      dateTime={row.watched_at}
                      className="text-xs text-muted sm:text-sm"
                    >
                      {dateLabel}
                    </time>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
