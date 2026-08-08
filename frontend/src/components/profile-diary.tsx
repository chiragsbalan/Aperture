'use client';

import { useEffect, useState } from 'react';

import { DiaryEntryCard } from '@/components/diary-entry-card';
import { DiaryEntrySheet } from '@/components/diary-entry-sheet';
import { useProfileIsOwner } from '@/components/public-profile';
import { DiaryCardsSkeleton } from '@/components/skeleton';
import {
  compareWatchEntriesNewestFirst,
  groupDiaryEntriesByMonth,
} from '@/lib/diary';
import {
  fetchPublicWatchEntries,
  invalidatePublicWatchEntries,
  peekPublicDiaryView,
  peekPublicWatchEntries,
  rememberPublicDiaryView,
  type WatchEntry,
} from '@/lib/library';
import { MOTION_DURATION_MED_MS } from '@/lib/motion';

type ReadyState = {
  status: 'ready';
  items: WatchEntry[];
  total: number;
  page: number;
  limit: number;
};

type LoadState =
  { status: 'loading' } | { status: 'error'; message: string } | ReadyState;

interface ProfileDiaryProps {
  username: string;
}

function initialDiaryState(username: string): LoadState {
  const view = peekPublicDiaryView(username);
  if (view != null) {
    return { status: 'ready', ...view };
  }
  const page = peekPublicWatchEntries(username);
  if (page != null) {
    const ready = {
      items: page.items,
      total: page.total,
      page: page.page,
      limit: page.limit,
    };
    rememberPublicDiaryView(username, ready);
    return { status: 'ready', ...ready };
  }
  return { status: 'loading' };
}

/** Profile diary wall — owner can open/edit/delete logs; visitors read-only. */
export function ProfileDiary({ username }: ProfileDiaryProps) {
  const isOwner = useProfileIsOwner();
  const [state, setState] = useState<LoadState>(() =>
    initialDiaryState(username),
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WatchEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    let cancelled = false;
    setLoadMoreError(null);

    async function load() {
      const hasView = peekPublicDiaryView(username) != null;
      if (!hasView) {
        setState({ status: 'loading' });
      }

      const result = await fetchPublicWatchEntries(username);
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        if (!hasView) {
          setState({ status: 'error', message: result.error });
        }
        return;
      }

      setState((previous) => {
        if (previous.status === 'ready' && previous.page > 1) {
          const next = { ...previous, total: result.data.total };
          rememberPublicDiaryView(username, {
            items: next.items,
            total: next.total,
            page: next.page,
            limit: next.limit,
          });
          return next;
        }
        const next = {
          status: 'ready' as const,
          items: result.data.items,
          total: result.data.total,
          page: result.data.page,
          limit: result.data.limit,
        };
        rememberPublicDiaryView(username, {
          items: next.items,
          total: next.total,
          page: next.page,
          limit: next.limit,
        });
        return next;
      });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [username]);

  function syncView(next: ReadyState) {
    rememberPublicDiaryView(username, {
      items: next.items,
      total: next.total,
      page: next.page,
      limit: next.limit,
    });
  }

  function openEntry(entry: WatchEntry) {
    setSelected(entry);
    setSheetOpen(true);
  }

  function handleUpdated(entry: WatchEntry) {
    invalidatePublicWatchEntries(username);
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      const next = {
        ...current,
        items: current.items
          .map((row) => (row.id === entry.id ? entry : row))
          .sort(compareWatchEntriesNewestFirst),
      };
      syncView(next);
      return next;
    });
    setSelected(entry);
  }

  function handleDeleted(entryId: string) {
    setLeavingIds((current) => new Set(current).add(entryId));
    window.setTimeout(() => {
      invalidatePublicWatchEntries(username);
      setState((current) => {
        if (current.status !== 'ready') {
          return current;
        }
        const next = {
          ...current,
          items: current.items.filter((row) => row.id !== entryId),
          total: Math.max(0, current.total - 1),
        };
        syncView(next);
        return next;
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
    setLoadMoreError(null);
    const nextPage = state.page + 1;
    const result = await fetchPublicWatchEntries(
      username,
      nextPage,
      state.limit,
    );
    setLoadingMore(false);
    if (!result.ok) {
      setLoadMoreError(result.error);
      return;
    }
    const next = {
      status: 'ready' as const,
      items: [...state.items, ...result.data.items],
      total: result.data.total,
      page: result.data.page,
      limit: result.data.limit,
    };
    syncView(next);
    setLoadMoreError(null);
    setState(next);
  }

  const monthGroups =
    state.status === 'ready' ? groupDiaryEntriesByMonth(state.items) : [];

  return (
    <section className="mt-10 text-left">
      {state.status === 'loading' ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading…</span>
          <DiaryCardsSkeleton className="mt-0" />
        </div>
      ) : null}

      {state.status === 'error' ? (
        <p className="text-[var(--color-danger)]" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === 'ready' && state.items.length === 0 ? (
        <p className="text-muted">No watches logged yet.</p>
      ) : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <>
          <div className="space-y-10">
            {monthGroups.map((group) => (
              <section
                key={group.key}
                aria-labelledby={`diary-${group.key}`}
                className="diary-month-section border-b border-[var(--color-border)] pb-10"
              >
                <h2
                  id={`diary-${group.key}`}
                  className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl"
                >
                  {group.label}
                </h2>
                <ul className="diary-entry-grid mt-5">
                  {group.entries.map((entry) => (
                    <DiaryEntryCard
                      key={entry.id}
                      entry={entry}
                      onOpen={isOwner ? openEntry : undefined}
                      leaving={leavingIds.has(entry.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {state.items.length < state.total ? (
            <div className="mt-8">
              <button
                type="button"
                className="btn btn-lg"
                disabled={loadingMore}
                aria-busy={loadingMore}
                onClick={() => {
                  void handleLoadMore();
                }}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
              {loadMoreError != null ? (
                <p
                  className="mt-3 text-sm text-[var(--color-danger)]"
                  role="alert"
                >
                  {loadMoreError}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {isOwner ? (
        <DiaryEntrySheet
          entry={selected}
          open={sheetOpen}
          onDismiss={() => {
            setSheetOpen(false);
          }}
          onClose={() => {
            setSheetOpen(false);
            setSelected(null);
          }}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      ) : null}
    </section>
  );
}
