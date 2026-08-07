'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ListTitleWithVisibility } from '@/components/list-title-with-visibility';
import { ListRowsSkeleton } from '@/components/skeleton';
import { fetchProfileLists, type ProfileListIndexEntry } from '@/lib/library';
import { listDetailHref } from '@/lib/list-nav';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; lists: ProfileListIndexEntry[] };

/** Custom lists only — watchlist lives on its own profile tab. */
export function ProfileLists({ username }: { username: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: 'loading' });
      const listsResult = await fetchProfileLists(username);
      if (cancelled) {
        return;
      }
      if (!listsResult.ok) {
        setState({
          status: 'error',
          message: listsResult.error,
        });
        return;
      }
      setState({
        status: 'ok',
        lists: listsResult.lists,
      });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (state.status === 'loading') {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading lists…</span>
        <ListRowsSkeleton />
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

  return (
    <section className="mt-6 text-left">
      {state.lists.length === 0 ? (
        <p className="text-muted">No lists to show.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] border-b border-[var(--color-border)]">
          {state.lists.map((list) => {
            const meta = `${list.item_count.toLocaleString('en-US')} title${
              list.item_count === 1 ? '' : 's'
            }`;
            return (
              <li key={list.id}>
                <Link
                  href={listDetailHref(list.id, `/u/${username}/lists`)}
                  className="flex flex-col gap-1 py-4 transition hover:text-[var(--color-accent)] sm:flex-row sm:items-baseline sm:justify-between"
                >
                  <span className="min-w-0">
                    <ListTitleWithVisibility
                      className="font-medium text-foreground"
                      title={list.title}
                      visibility={list.visibility}
                    />
                    {list.description ? (
                      <span className="mt-1 block text-sm text-muted">
                        {list.description}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm text-muted">{meta}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
