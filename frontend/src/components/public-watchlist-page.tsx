'use client';

import { useEffect, useState } from 'react';

import { PosterGridSkeleton } from '@/components/skeleton';
import { TitlePosterLink } from '@/components/title-poster-link';
import {
  fetchPublicWatchlist,
  hrefForLibraryContent,
  type LibraryListItem,
} from '@/lib/library';
import { POSTER_GRID_SIZES } from '@/lib/poster';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      items: LibraryListItem[];
      total: number;
      page: number;
      limit: number;
    };

/** Public watchlist tab panel for a profile (always world-readable). */
export function PublicWatchlistPage({ username }: { username: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchPublicWatchlist(username);
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setState({ status: 'error', message: result.error });
        return;
      }
      setState({
        status: 'ready',
        items: result.data.items,
        total: result.data.total,
        page: result.data.page,
        limit: result.data.limit,
      });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [username]);

  async function handleLoadMore() {
    if (state.status !== 'ready' || loadingMore) {
      return;
    }
    setLoadingMore(true);
    const nextPage = state.page + 1;
    const result = await fetchPublicWatchlist(username, nextPage, state.limit);
    setLoadingMore(false);
    if (!result.ok) {
      setState({ status: 'error', message: result.error });
      return;
    }
    setState({
      status: 'ready',
      items: [...state.items, ...result.data.items],
      total: result.data.total,
      page: result.data.page,
      limit: result.data.limit,
    });
  }

  if (state.status === 'loading') {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading…</span>
        <PosterGridSkeleton className="mt-6" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p className="mt-6 text-[var(--color-danger)]" role="alert">
        {state.message}
      </p>
    );
  }

  if (state.items.length === 0) {
    return (
      <p className="mt-6 text-muted">
        @{username} has nothing on their watchlist yet.
      </p>
    );
  }

  return (
    <section className="mt-6 text-left">
      <ul className="poster-grid">
        {state.items.map((item) => (
          <li key={item.item_id} className="min-w-0">
            <TitlePosterLink
              href={hrefForLibraryContent(item.content)}
              contentId={item.content.id}
              posterUrl={item.content.poster_url}
              posterAlt={`${item.content.title} poster`}
              ariaLabel={
                item.content.year != null
                  ? `${item.content.title} (${item.content.year})`
                  : item.content.title
              }
              sizes={POSTER_GRID_SIZES}
              className="block min-w-0 overflow-hidden transition hover:opacity-90"
            >
              <div className="poster-meta">
                <p className="mt-2 truncate font-display text-sm font-medium text-foreground">
                  {item.content.title}
                </p>
                {item.content.year != null ? (
                  <p className="truncate text-xs text-muted">
                    {item.content.year}
                  </p>
                ) : null}
              </div>
            </TitlePosterLink>
          </li>
        ))}
      </ul>
      {state.items.length < state.total ? (
        <button
          type="button"
          className="btn btn-lg mt-8"
          disabled={loadingMore}
          aria-busy={loadingMore}
          onClick={() => {
            void handleLoadMore();
          }}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
}
