'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { TitlePosterLink } from '@/components/title-poster-link';
import {
  fetchPublicWatchEntries,
  hrefForLibraryContent,
  peekPublicDiaryView,
  peekPublicWatchEntries,
  rememberPublicDiaryView,
  type WatchEntry,
} from '@/lib/library';
import { armTitlePosterMorph } from '@/lib/title-poster-morph';

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

interface DiaryMonthGroup {
  key: string;
  label: string;
  entries: WatchEntry[];
}

function formatMonthLabel(yearMonth: string): string {
  const [yearText, monthText] = yearMonth.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return yearMonth;
  }
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatDayLabel(isoDate: string): string {
  const day = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(day)) {
    return isoDate;
  }
  return String(day);
}

function groupEntriesByMonth(entries: WatchEntry[]): DiaryMonthGroup[] {
  const groups: DiaryMonthGroup[] = [];
  let current: DiaryMonthGroup | null = null;
  for (const entry of entries) {
    const key = entry.watched_at.slice(0, 7);
    if (current == null || current.key !== key) {
      current = {
        key,
        label: formatMonthLabel(key),
        entries: [],
      };
      groups.push(current);
    }
    current.entries.push(entry);
  }
  return groups;
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

/** Public diary wall for a profile (read-only). */
export function ProfileDiary({ username }: ProfileDiaryProps) {
  const [state, setState] = useState<LoadState>(() =>
    initialDiaryState(username),
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

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
        // Keep an expanded "load more" view; only refresh total.
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
      // Keep already-visible entries; surface failure near Load more.
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
    rememberPublicDiaryView(username, {
      items: next.items,
      total: next.total,
      page: next.page,
      limit: next.limit,
    });
    setLoadMoreError(null);
    setState(next);
  }

  const monthGroups =
    state.status === 'ready' ? groupEntriesByMonth(state.items) : [];

  return (
    <section className="mt-10 text-left">
      {state.status === 'loading' ? (
        <p className="text-muted" role="status">
          Loading…
        </p>
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
                className="border-b border-[var(--color-border)] pb-10"
              >
                <h2
                  id={`diary-${group.key}`}
                  className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                >
                  {group.label}
                </h2>
                <ul className="mt-5 space-y-6">
                  {group.entries.map((entry) => (
                    <li key={entry.id} className="flex gap-4">
                      <TitlePosterLink
                        href={hrefForLibraryContent(entry.content)}
                        contentId={entry.content.id}
                        posterUrl={entry.content.poster_url}
                        posterAlt={`${entry.content.title} poster`}
                        sizes="80px"
                        posterFrameClassName="w-20"
                        className="shrink-0"
                        ariaLabel={entry.content.title}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <Link
                            href={hrefForLibraryContent(entry.content)}
                            className="font-medium text-foreground"
                            onClick={() => {
                              armTitlePosterMorph({
                                contentId: entry.content.id,
                                posterUrl: entry.content.poster_url,
                                alt: `${entry.content.title} poster`,
                              });
                            }}
                          >
                            {entry.content.title}
                          </Link>
                          <time
                            dateTime={entry.watched_at}
                            className="text-sm text-muted"
                          >
                            {formatDayLabel(entry.watched_at)}
                          </time>
                        </div>
                        {entry.note ? (
                          <p className="mt-2 text-sm text-foreground">
                            {entry.note}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {state.items.length < state.total ? (
            <div className="mt-8">
              <button
                type="button"
                className="border border-[var(--color-border)] px-4 py-2 text-sm text-foreground transition hover:border-foreground disabled:opacity-60"
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
    </section>
  );
}
