'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ActionToast } from '@/components/action-toast';
import { LibraryNav } from '@/components/library-nav';
import { LibraryPosterCell } from '@/components/library-poster-cell';
import {
  CheckOutlineIcon,
  PencilOutlineIcon,
} from '@/components/shelf-chrome-icons';
import {
  addLibraryItem,
  fetchSystemList,
  removeLibraryItem,
  type LibraryKind,
  type LibraryListItem,
} from '@/lib/library';
import {
  dedupeLibraryListItems,
  nextShelfPage,
  nextShelfWindowLimit,
  TITLE_SHELF_PAGE_SIZE,
  TITLE_SHELF_SYSTEM_MAX_FETCH,
} from '@/lib/title-shelf';

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

interface UndoState {
  item: LibraryListItem;
  previousTotal: number;
}

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
  const [editing, setEditing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchSystemList(kind, 1, TITLE_SHELF_PAGE_SIZE);
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
        items: dedupeLibraryListItems(result.data.items),
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

  useEffect(() => {
    if (state.status === 'ready' && state.total === 0) {
      setEditing(false);
    }
  }, [state]);

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
            : [item, ...current.items].sort(
                (a, b) => Date.parse(b.added_at) - Date.parse(a.added_at),
              ),
          total: previousTotal,
        };
      });
      return;
    }
    setUndo({ item, previousTotal });
  }

  async function handleUndo() {
    if (undo == null || state.status !== 'ready') {
      return;
    }
    const { item, previousTotal } = undo;
    setUndo(null);
    setPendingId(item.item_id);
    setActionError(null);
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      const already = current.items.some((row) => row.item_id === item.item_id);
      return {
        ...current,
        items: already
          ? current.items
          : [item, ...current.items].sort(
              (a, b) => Date.parse(b.added_at) - Date.parse(a.added_at),
            ),
        total: previousTotal,
      };
    });
    const result = await addLibraryItem(
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
        return {
          ...current,
          items: current.items.filter((row) => row.item_id !== item.item_id),
          total: Math.max(0, current.total - 1),
        };
      });
    }
  }

  async function handleLoadMore() {
    if (state.status !== 'ready' || loadingMore) {
      return;
    }
    if (state.items.length >= state.total) {
      return;
    }
    setLoadingMore(true);
    setActionError(null);
    // Below system max: expand page=1 window (safe after removes).
    // At/above max: append the next page and dedupe.
    const useWindow = state.items.length < TITLE_SHELF_SYSTEM_MAX_FETCH;
    const result = useWindow
      ? await fetchSystemList(
          kind,
          1,
          nextShelfWindowLimit(
            state.items.length,
            TITLE_SHELF_SYSTEM_MAX_FETCH,
          ),
        )
      : await fetchSystemList(
          kind,
          nextShelfPage(state.items.length),
          TITLE_SHELF_PAGE_SIZE,
        );
    if (!mountedRef.current) {
      return;
    }
    setLoadingMore(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      const items = useWindow
        ? dedupeLibraryListItems(result.data.items)
        : dedupeLibraryListItems([
            ...current.items,
            ...result.data.items,
          ]);
      return {
        status: 'ready',
        items,
        total: result.data.total,
        page: result.data.page,
        limit: result.data.limit,
      };
    });
  }

  return (
    <div className="layout-content motion-fade-rise text-left">
      <div className="flex items-start justify-between gap-4">
        <h1 className="type-page-lg text-foreground">{title}</h1>
        {state.status === 'ready' && state.total > 0 ? (
          <button
            type="button"
            aria-label={editing ? 'Done' : 'Edit'}
            aria-pressed={editing}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-muted transition hover:bg-[var(--color-accent-soft)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            onClick={() => {
              setEditing((value) => !value);
            }}
          >
            {editing ? <CheckOutlineIcon /> : <PencilOutlineIcon />}
          </button>
        ) : null}
      </div>
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

      {state.status === 'ready' && state.total === 0 ? (
        <p className="mt-10 text-muted">{emptyMessage}</p>
      ) : null}

      {state.status === 'ready' && state.total > 0 && state.items.length === 0 ? (
        <p className="mt-10 text-muted" role="status">
          Load more to see the rest of this list.
        </p>
      ) : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <ul className="poster-grid mt-10">
          {state.items.map((item) => (
            <li key={item.item_id} className="min-w-0">
              <LibraryPosterCell
                item={item}
                editing={editing}
                removePending={pendingId === item.item_id}
                onRemove={() => {
                  void handleRemove(item);
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {state.status === 'ready' && state.items.length < state.total ? (
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

      {undo != null ? (
        <ActionToast
          message={`Removed ${undo.item.content.title}`}
          actionLabel="Undo"
          onAction={() => {
            void handleUndo();
          }}
          onDismiss={() => {
            setUndo(null);
          }}
        />
      ) : null}
    </div>
  );
}
