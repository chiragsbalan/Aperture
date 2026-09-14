'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ListTitleWithVisibility } from '@/components/list-title-with-visibility';
import { ReviewsListSkeleton } from '@/components/skeleton';
import { toLibraryContentType } from '@/lib/library';
import {
  fetchTitleLists,
  TITLE_REVIEWS_INLINE_LIMIT,
  type TitlePublicList,
} from '@/lib/reviews';

export function TitleLists({
  contentType,
  contentId,
  onMetaChange,
}: {
  contentType: string;
  contentId: string;
  onMetaChange?: (meta: { total: number; ready: boolean }) => void;
}) {
  const kind = toLibraryContentType(contentType);
  const [items, setItems] = useState<TitlePublicList[]>([]);
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
      const result = await fetchTitleLists(titleKind, contentId, {
        page: 1,
        limit: TITLE_REVIEWS_INLINE_LIMIT,
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

  const listsReady = status === 'ready';

  useEffect(() => {
    if (onMetaChange == null) {
      return;
    }
    onMetaChange({
      total,
      ready: listsReady,
    });
  }, [onMetaChange, total, listsReady]);

  if (kind == null) {
    return null;
  }

  const inlineItems = items.slice(0, TITLE_REVIEWS_INLINE_LIMIT);

  return (
    <div>
      {status === 'loading' ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading lists…</span>
          <ReviewsListSkeleton count={5} />
        </div>
      ) : null}

      {status === 'error' ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error ?? 'Could not load lists.'}
        </p>
      ) : null}

      {status === 'ready' && inlineItems.length === 0 ? (
        <p className="text-xs text-muted sm:text-sm">No public lists yet.</p>
      ) : null}

      {status === 'ready' && inlineItems.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)]">
          {inlineItems.map((row) => {
            const ownerName =
              row.owner.display_name?.trim() || `@${row.owner.username}`;
            return (
              <li key={row.id} className="py-4 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link
                    href={`/lists/${encodeURIComponent(row.id)}`}
                    className="min-w-0 text-foreground underline decoration-[var(--color-border)] underline-offset-4 transition hover:decoration-accent"
                  >
                    <ListTitleWithVisibility
                      title={row.title}
                      visibility="public"
                    />
                  </Link>
                  <Link
                    href={`/u/${encodeURIComponent(row.owner.username)}`}
                    className="shrink-0 text-sm text-muted underline decoration-[var(--color-border)] underline-offset-4 transition hover:text-foreground hover:decoration-accent"
                  >
                    {ownerName}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
