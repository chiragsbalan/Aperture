'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { LibraryNav } from '@/components/library-nav';
import {
  deleteWatchEntry,
  fetchWatchEntries,
  hrefForLibraryContent,
  patchWatchEntry,
  type WatchEntry,
} from '@/lib/library';

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
  const formId = useId();
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WatchEntry | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [deleting, setDeleting] = useState<WatchEntry | null>(null);
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

  function openEdit(entry: WatchEntry) {
    setEditing(entry);
    setEditDate(entry.watched_at);
    setEditNote(entry.note ?? '');
    editDialogRef.current?.showModal();
  }

  function openDelete(entry: WatchEntry) {
    setDeleting(entry);
    deleteDialogRef.current?.showModal();
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (editing == null || pending) {
      return;
    }
    setPending(true);
    setActionError(null);
    const result = await patchWatchEntry(editing.id, {
      watched_at: editDate,
      note: editNote.trim() || null,
    });
    setPending(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      return {
        ...current,
        items: current.items.map((row) =>
          row.id === result.entry.id ? result.entry : row,
        ),
      };
    });
    editDialogRef.current?.close();
    setEditing(null);
  }

  async function handleDelete() {
    if (deleting == null || pending) {
      return;
    }
    setPending(true);
    setActionError(null);
    const result = await deleteWatchEntry(deleting.id);
    setPending(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      return {
        ...current,
        items: current.items.filter((row) => row.id !== deleting.id),
        total: Math.max(0, current.total - 1),
      };
    });
    deleteDialogRef.current?.close();
    setDeleting(null);
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
      <p className="mt-2 text-muted">Watches you have logged over time.</p>
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
        <p className="mt-10 text-muted">
          No watches logged. Use Log watch on any movie or TV page.
        </p>
      ) : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <>
          <ul className="mt-10 space-y-6">
            {state.items.map((entry) => (
              <li key={entry.id} className="flex gap-4">
                <Link
                  href={hrefForLibraryContent(entry.content)}
                  className="shrink-0"
                >
                  {entry.content.poster_url ? (
                    <Image
                      src={entry.content.poster_url}
                      alt={`${entry.content.title} poster`}
                      width={80}
                      height={120}
                      className="h-auto w-20 object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="flex h-[120px] w-20 items-center justify-center bg-[var(--color-bg-elevated)] text-xs text-muted"
                    >
                      No image
                    </div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={hrefForLibraryContent(entry.content)}
                    className="font-medium text-foreground"
                  >
                    {entry.content.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted">{entry.watched_at}</p>
                  {entry.note ? (
                    <p className="mt-2 text-sm text-foreground">{entry.note}</p>
                  ) : null}
                  <div className="mt-2 flex gap-3 text-sm">
                    <button
                      type="button"
                      className="text-muted transition hover:text-foreground"
                      onClick={() => {
                        openEdit(entry);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-muted transition hover:text-foreground"
                      onClick={() => {
                        openDelete(entry);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
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

      <dialog
        ref={editDialogRef}
        className="w-full max-w-md border border-[var(--color-border)] bg-[var(--color-bg)] p-6 text-foreground backdrop:bg-black/50"
        aria-labelledby={`${formId}-edit-heading`}
      >
        <form
          onSubmit={(event) => {
            void handleSaveEdit(event);
          }}
          className="space-y-4"
        >
          <h2 id={`${formId}-edit-heading`} className="type-card-title">
            Edit diary entry
          </h2>
          <div>
            <label
              htmlFor={`${formId}-date`}
              className="block text-sm text-muted"
            >
              Watched on
            </label>
            <input
              id={`${formId}-date`}
              type="date"
              required
              value={editDate}
              onChange={(event) => {
                setEditDate(event.target.value);
              }}
              className="mt-1 border border-[var(--color-border)] bg-transparent px-3 py-2"
            />
          </div>
          <div>
            <label
              htmlFor={`${formId}-note`}
              className="block text-sm text-muted"
            >
              Note (optional)
            </label>
            <textarea
              id={`${formId}-note`}
              maxLength={1000}
              rows={3}
              value={editNote}
              onChange={(event) => {
                setEditNote(event.target.value);
              }}
              className="mt-1 w-full border border-[var(--color-border)] bg-transparent px-3 py-2"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending}
              className="border border-[var(--color-border)] bg-[var(--color-accent-soft)] px-3 py-2 text-sm"
            >
              Save
            </button>
            <button
              type="button"
              className="border border-[var(--color-border)] px-3 py-2 text-sm"
              onClick={() => {
                editDialogRef.current?.close();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={deleteDialogRef}
        className="w-full max-w-md border border-[var(--color-border)] bg-[var(--color-bg)] p-6 text-foreground backdrop:bg-black/50"
        aria-labelledby={`${formId}-delete-heading`}
      >
        <h2 id={`${formId}-delete-heading`} className="type-card-title">
          Delete this diary entry?
        </h2>
        <p className="mt-2 text-sm text-muted">
          {deleting
            ? `Remove the watch of ${deleting.content.title} on ${deleting.watched_at}.`
            : 'This cannot be undone.'}
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            disabled={pending}
            className="border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-danger)]"
            onClick={() => {
              void handleDelete();
            }}
          >
            Delete
          </button>
          <button
            type="button"
            className="border border-[var(--color-border)] px-3 py-2 text-sm"
            onClick={() => {
              deleteDialogRef.current?.close();
            }}
          >
            Cancel
          </button>
        </div>
      </dialog>
    </div>
  );
}
