'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { DiaryEntryCard } from '@/components/diary-entry-card';
import { DiaryEntrySheet } from '@/components/diary-entry-sheet';
import { LibraryNav } from '@/components/library-nav';
import { DiaryCardsSkeleton } from '@/components/skeleton';
import {
  compareWatchEntriesNewestFirst,
  groupDiaryEntriesByMonth,
} from '@/lib/diary';
import { fetchWatchEntries, type WatchEntry } from '@/lib/library';
import { MOTION_DURATION_MED_MS } from '@/lib/motion';

type LoadState =
  | { status: 'loading' }
  | { status: 'signed_out'; error: string }
  | { status: 'error'; error: string }
  | {
      status: 'ready';
      items: WatchEntry[];
      total: number;
      page: number;
      limit: number;
    };

export function DiaryPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WatchEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchWatchEntries();
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
  }, []);

  function openEntry(entry: WatchEntry) {
    setSelected(entry);
    setSheetOpen(true);
    setActionError(null);
  }

  function dismissSheet() {
    setSheetOpen(false);
  }

  function closeSheet() {
    setSheetOpen(false);
    setSelected(null);
  }

  function handleUpdated(entry: WatchEntry) {
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      return {
        ...current,
        items: current.items
          .map((row) => (row.id === entry.id ? entry : row))
          .sort(compareWatchEntriesNewestFirst),
      };
    });
    setSelected(entry);
  }

  function handleDeleted(entryId: string) {
    setLeavingIds((current) => new Set(current).add(entryId));
    window.setTimeout(() => {
      setState((current) => {
        if (current.status !== 'ready') {
          return current;
        }
        return {
          ...current,
          items: current.items.filter((row) => row.id !== entryId),
          total: Math.max(0, current.total - 1),
        };
      });
      setLeavingIds((current) => {
        const next = new Set(current);
        next.delete(entryId);
        return next;
      });
      setSelected((current) => (current?.id === entryId ? null : current));
    }, MOTION_DURATION_MED_MS);
  }

  async function handleLoadMore() {
    if (state.status !== 'ready' || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setActionError(null);
    const nextPage = state.page + 1;
    const result = await fetchWatchEntries(nextPage, state.limit);
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
      <h1 className="type-page-lg text-foreground">Diary</h1>
      <p className="mt-2 text-muted">Your logged watches.</p>
      <LibraryNav />

      {state.status === 'loading' ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading…</span>
          <DiaryCardsSkeleton className="mt-10" />
        </div>
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
        <p className="mt-10 text-muted">
          Nothing logged yet. Use Log on any movie or TV page.
        </p>
      ) : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <>
          <div className="mt-10 space-y-10">
            {groupDiaryEntriesByMonth(state.items).map((group) => (
              <section
                key={group.key}
                aria-labelledby={`library-diary-${group.key}`}
                className="diary-month-section border-b border-[var(--color-border)] pb-10"
              >
                <h2
                  id={`library-diary-${group.key}`}
                  className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl"
                >
                  {group.label}
                </h2>
                <ul className="diary-entry-grid mt-5">
                  {group.entries.map((entry) => (
                    <DiaryEntryCard
                      key={entry.id}
                      entry={entry}
                      onOpen={openEntry}
                      leaving={leavingIds.has(entry.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
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
        </>
      ) : null}

      <DiaryEntrySheet
        entry={selected}
        open={sheetOpen}
        onDismiss={dismissSheet}
        onClose={closeSheet}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
