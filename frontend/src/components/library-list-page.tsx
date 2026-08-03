'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { LibraryNav } from '@/components/library-nav';
import { TitlePosterLink } from '@/components/title-poster-link';
import {
  fetchSystemList,
  hrefForLibraryContent,
  removeLibraryItem,
  type LibraryKind,
  type LibraryListItem,
} from '@/lib/library';

type LoadState =
  | { status: 'loading' }
  | { status: 'signed_out'; error: string }
  | { status: 'error'; error: string }
  | {
      status: 'ready';
      items: LibraryListItem[];
      total: number;
      page: number;
      limit: number;
    };

export function LibraryListPage({
  kind,
  title,
  emptyMessage,
}: {
  kind: LibraryKind;
  title: string;
  emptyMessage: string;
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchSystemList(kind);
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setState(
          result.status === 401
            ? { status: 'signed_out', error: result.error }
            : { status: 'error', error: result.error },
        );
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
  }, [kind]);

  async function handleRemove(item: LibraryListItem) {
    if (state.status !== 'ready' || pendingId != null) {
      return;
    }
    setPendingId(item.item_id);
    setActionError(null);
    const previousTotal = state.total;
    setState({
      ...state,
      items: state.items.filter((row) => row.item_id !== item.item_id),
      total: Math.max(0, state.total - 1),
    });
    const result = await removeLibraryItem(
      kind,
      item.content.type,
      item.content.id,
    );
    setPendingId(null);
    if (!result.ok) {
      setActionError(result.error);
      setState((current) => {
        if (current.status !== 'ready') {
          return current;
        }
        const already = current.items.some(
          (row) => row.item_id === item.item_id,
        );
        return {
          ...current,
          items: already
            ? current.items
            : [...current.items, item].sort((a, b) => a.position - b.position),
          total: previousTotal,
        };
      });
    }
  }

  async function handleLoadMore() {
    if (state.status !== 'ready' || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setActionError(null);
    const nextPage = state.page + 1;
    const result = await fetchSystemList(kind, nextPage, state.limit);
    setLoadingMore(false);
    if (!result.ok) {
      setActionError(result.error);
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

  return (
    <div className="layout-content motion-fade-rise text-left">
      <h1 className="type-page-lg text-foreground">{title}</h1>
      <p className="mt-2 text-muted">
        Your personal {kind === 'watchlist' ? 'queue' : 'favorites'}.
      </p>
      <LibraryNav />

      {state.status === 'loading' ? (
        <p className="mt-10 text-muted" role="status">
          Loading…
        </p>
      ) : null}

      {state.status === 'signed_out' ? (
        <p className="mt-10 text-muted" role="status">
          {state.error}{' '}
          <Link href="/login" className="text-foreground underline">
            Log in
          </Link>
        </p>
      ) : null}

      {state.status === 'error' ? (
        <p className="mt-10 text-[var(--color-danger)]" role="alert">
          {state.error}
        </p>
      ) : null}

      {actionError ? (
        <p className="mt-6 text-[var(--color-danger)]" role="alert">
          {actionError}
        </p>
      ) : null}

      {state.status === 'ready' && state.items.length === 0 ? (
        <p className="mt-10 text-muted">{emptyMessage}</p>
      ) : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <>
          <ul className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3">
            {state.items.map((item) => (
              <li key={item.item_id} className="min-w-0">
                <TitlePosterLink
                  href={hrefForLibraryContent(item.content)}
                  contentId={item.content.id}
                  posterUrl={item.content.poster_url}
                  posterAlt={`${item.content.title} poster`}
                  sizes="(max-width: 640px) 45vw, 200px"
                  className="block"
                >
                  <p className="mt-2 truncate font-medium text-foreground">
                    {item.content.title}
                  </p>
                  {item.content.year != null ? (
                    <p className="text-sm text-muted">{item.content.year}</p>
                  ) : null}
                </TitlePosterLink>
                <button
                  type="button"
                  aria-label={`Remove ${item.content.title} from ${kind}`}
                  aria-busy={pendingId === item.item_id}
                  className="mt-2 text-sm text-muted transition hover:text-foreground"
                  disabled={pendingId != null}
                  onClick={() => {
                    void handleRemove(item);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {state.items.length < state.total ? (
            <button
              type="button"
              className="mt-8 border border-[var(--color-border)] px-4 py-2 text-sm text-foreground transition hover:border-foreground disabled:opacity-60"
              disabled={loadingMore}
              aria-busy={loadingMore}
              onClick={() => {
                void handleLoadMore();
              }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
