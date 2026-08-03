'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type FormEvent } from 'react';

import { LibraryNav } from '@/components/library-nav';
import {
  createCustomList,
  fetchMyCustomLists,
  type CustomListSummary,
  type ListVisibility,
} from '@/lib/library';

type LoadState =
  | { status: 'loading' }
  | { status: 'signed_out'; error: string }
  | { status: 'error'; error: string }
  | { status: 'ready'; lists: CustomListSummary[] };

export function CustomListsPage() {
  const formId = useId();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ListVisibility>('private');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (creating || !title.trim()) {
      return;
    }
    setCreating(true);
    setActionError(null);
    const result = await createCustomList({
      title: title.trim(),
      description: description.trim() || null,
      visibility,
    });
    setCreating(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setTitle('');
    setDescription('');
    setVisibility('private');
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      const summary: CustomListSummary = {
        id: result.list.id,
        title: result.list.title,
        description: result.list.description,
        visibility: result.list.visibility,
        item_count: result.list.item_count,
        created_at: result.list.created_at,
        updated_at: result.list.updated_at,
      };
      return { status: 'ready', lists: [summary, ...current.lists] };
    });
  }

  return (
    <div className="layout-content motion-fade-rise text-left">
      <h1 className="type-page-lg text-foreground">Lists</h1>
      <p className="mt-2 text-muted">Curate named collections of titles.</p>
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
        <>
          <form
            onSubmit={(event) => {
              void handleCreate(event);
            }}
            className="mt-10 space-y-4 border-t border-[var(--color-border)] pt-8"
            aria-labelledby={`${formId}-heading`}
          >
            <h2
              id={`${formId}-heading`}
              className="type-card-title text-foreground"
            >
              Create a list
            </h2>
            <div>
              <label
                htmlFor={`${formId}-title`}
                className="block text-sm text-muted"
              >
                Title
              </label>
              <input
                id={`${formId}-title`}
                name="title"
                required
                maxLength={100}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
                className="mt-1 w-full border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
              />
            </div>
            <div>
              <label
                htmlFor={`${formId}-description`}
                className="block text-sm text-muted"
              >
                Description (optional)
              </label>
              <textarea
                id={`${formId}-description`}
                name="description"
                maxLength={2000}
                rows={3}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
                className="mt-1 w-full border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
              />
            </div>
            <div>
              <label
                htmlFor={`${formId}-visibility`}
                className="block text-sm text-muted"
              >
                Visibility
              </label>
              <select
                id={`${formId}-visibility`}
                name="visibility"
                value={visibility}
                onChange={(event) => {
                  setVisibility(event.target.value as ListVisibility);
                }}
                className="mt-1 border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={creating || !title.trim()}
              aria-busy={creating}
              className="border border-[var(--color-border)] bg-[var(--color-accent-soft)] px-4 py-2 text-sm text-foreground transition hover:border-foreground disabled:opacity-60"
            >
              {creating ? 'Creating…' : 'Create list'}
            </button>
          </form>

          {actionError ? (
            <p className="mt-4 text-[var(--color-danger)]" role="alert">
              {actionError}
            </p>
          ) : null}

          {state.lists.length === 0 ? (
            <p className="mt-10 text-muted">
              No custom lists yet. Create one above.
            </p>
          ) : (
            <ul className="mt-10 space-y-4">
              {state.lists.map((list) => (
                <li key={list.id}>
                  <Link
                    href={`/lists/${list.id}`}
                    className="block border-b border-[var(--color-border)] pb-4 transition hover:border-foreground"
                  >
                    <span className="font-medium text-foreground">
                      {list.title}
                    </span>
                    <span className="mt-1 block text-sm text-muted">
                      {list.item_count}{' '}
                      {list.item_count === 1 ? 'title' : 'titles'} ·{' '}
                      {list.visibility}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
