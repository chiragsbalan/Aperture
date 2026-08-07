'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CreateCustomListSheet } from '@/components/create-custom-list-sheet';
import { LibraryNav } from '@/components/library-nav';
import { ListTitleWithVisibility } from '@/components/list-title-with-visibility';
import { PlusOutlineIcon } from '@/components/shelf-chrome-icons';
import { fetchMyCustomLists, type CustomListSummary } from '@/lib/library';
import { listDetailHref } from '@/lib/list-nav';

type LoadState =
  | { status: 'loading' }
  | { status: 'signed_out'; error: string }
  | { status: 'error'; error: string }
  | { status: 'ready'; lists: CustomListSummary[] };

export function CustomListsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const result = await fetchMyCustomLists();
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
      setState({ status: 'ready', lists: result.lists });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchParams.get('create') !== '1') {
      return;
    }
    setCreateOpen(true);
    router.replace('/library/lists', { scroll: false });
  }, [searchParams, router]);

  function openCreateSheet() {
    setCreateOpen(true);
  }

  function dismissCreateSheet() {
    setCreateOpen(false);
  }

  return (
    <div className="layout-content motion-fade-rise text-left">
      <div className="flex items-start justify-between gap-4">
        <h1 className="type-page-lg text-foreground">Lists</h1>
        {state.status === 'ready' ? (
          <button
            type="button"
            aria-label="Create a list"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-muted transition hover:bg-[var(--color-accent-soft)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
            onClick={openCreateSheet}
          >
            <PlusOutlineIcon />
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-muted">Your personal shelves.</p>
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

      {state.status === 'ready' ? (
        state.lists.length === 0 ? (
          <p className="mt-10 text-muted">
            No lists yet. Use Create a list above.
          </p>
        ) : (
          <ul className="mt-10 space-y-4">
            {state.lists.map((list) => (
              <li key={list.id}>
                <Link
                  href={listDetailHref(list.id, '/library/lists')}
                  className="block border-b border-[var(--color-border)] pb-4 transition hover:border-foreground"
                >
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
                  <span className="mt-1 block text-sm text-muted">
                    {list.item_count}{' '}
                    {list.item_count === 1 ? 'title' : 'titles'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      <CreateCustomListSheet
        open={createOpen}
        onDismiss={dismissCreateSheet}
        onClose={dismissCreateSheet}
        onCreated={(list) => {
          setState((current) => {
            if (current.status !== 'ready') {
              return current;
            }
            return { status: 'ready', lists: [list, ...current.lists] };
          });
        }}
      />
    </div>
  );
}
