'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { LibraryNav } from '@/components/library-nav';
import {
  deleteCustomList,
  fetchCustomList,
  fetchCustomListItems,
  hrefForLibraryContent,
  patchCustomList,
  removeCustomListItem,
  reorderCustomListItems,
  type CustomListDetail,
  type LibraryListItem,
  type ListVisibility,
} from '@/lib/library';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | {
      status: 'ready';
      list: CustomListDetail;
      items: LibraryListItem[];
      isOwner: boolean;
    };

export function CustomListDetailPage({ listId }: { listId: string }) {
  const router = useRouter();
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editVisibility, setEditVisibility] =
    useState<ListVisibility>('private');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [listResult, itemsResult] = await Promise.all([
        fetchCustomList(listId),
        fetchCustomListItems(listId, 1, 500),
      ]);
      if (cancelled) {
        return;
      }
      if (!listResult.ok) {
        setState({ status: 'error', error: listResult.error });
        return;
      }
      if (!itemsResult.ok) {
        setState({ status: 'error', error: itemsResult.error });
        return;
      }
      setState({
        status: 'ready',
        list: listResult.list,
        items: itemsResult.data.items,
        isOwner: listResult.list.is_owner,
      });
      setEditTitle(listResult.list.title);
      setEditDescription(listResult.list.description ?? '');
      setEditVisibility(listResult.list.visibility);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [listId]);

  async function moveItem(index: number, direction: -1 | 1) {
    if (state.status !== 'ready' || !state.isOwner || pending) {
      return;
    }
    const target = index + direction;
    if (target < 0 || target >= state.items.length) {
      return;
    }
    const next = [...state.items];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    const previous = state.items;
    setState({ ...state, items: next });
    setPending(true);
    setActionError(null);
    const result = await reorderCustomListItems(
      listId,
      next.map((item) => item.item_id),
    );
    setPending(false);
    if (!result.ok) {
      setActionError(result.error);
      setState({ ...state, items: previous });
      return;
    }
    setState({ ...state, items: result.data.items });
  }

  async function handleRemove(item: LibraryListItem) {
    if (state.status !== 'ready' || !state.isOwner || pending) {
      return;
    }
    setPending(true);
    setActionError(null);
    const previous = state.items;
    setState({
      ...state,
      items: state.items.filter((row) => row.item_id !== item.item_id),
      list: {
        ...state.list,
        item_count: Math.max(0, state.list.item_count - 1),
      },
    });
    const result = await removeCustomListItem(listId, item.item_id);
    setPending(false);
    if (!result.ok) {
      setActionError(result.error);
      setState({ ...state, items: previous });
    }
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (state.status !== 'ready' || pending) {
      return;
    }
    setPending(true);
    setActionError(null);
    const result = await patchCustomList(listId, {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      visibility: editVisibility,
    });
    setPending(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setState({ ...state, list: result.list });
    editDialogRef.current?.close();
  }

  async function handleDelete() {
    if (state.status !== 'ready' || pending) {
      return;
    }
    setPending(true);
    setActionError(null);
    const result = await deleteCustomList(listId);
    setPending(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    deleteDialogRef.current?.close();
    router.push('/library/lists');
  }

  return (
    <div className="motion-fade-rise w-full max-w-3xl text-left">
      {state.status === 'loading' ? (
        <p className="mt-10 text-muted" role="status">
          Loading…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <p className="mt-10 text-[var(--color-danger)]" role="alert">
          {state.error}{' '}
          <Link href="/library/lists" className="underline">
            Back to lists
          </Link>
        </p>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <p className="text-sm text-muted">
            <Link href="/library/lists" className="underline">
              Lists
            </Link>
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
            {state.list.title}
          </h1>
          <p className="mt-2 text-muted">
            {state.list.visibility}
            {state.list.description ? ` · ${state.list.description}` : ''}
          </p>
          <LibraryNav />

          {state.isOwner ? (
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="border border-[var(--color-border)] px-3 py-2 text-sm text-foreground transition hover:border-foreground"
                onClick={() => {
                  editDialogRef.current?.showModal();
                }}
              >
                Edit list
              </button>
              <button
                type="button"
                className="border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-danger)] transition hover:border-foreground"
                onClick={() => {
                  deleteDialogRef.current?.showModal();
                }}
              >
                Delete list
              </button>
            </div>
          ) : null}

          {actionError ? (
            <p className="mt-4 text-[var(--color-danger)]" role="alert">
              {actionError}
            </p>
          ) : null}

          {state.items.length === 0 ? (
            <p className="mt-10 text-muted">This list is empty.</p>
          ) : (
            <ol className="mt-10 space-y-6">
              {state.items.map((item, index) => (
                <li key={item.item_id} className="flex gap-4">
                  <Link
                    href={hrefForLibraryContent(item.content)}
                    className="shrink-0"
                  >
                    {item.content.poster_url ? (
                      <Image
                        src={item.content.poster_url}
                        alt={`${item.content.title} poster`}
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
                      href={hrefForLibraryContent(item.content)}
                      className="font-medium text-foreground"
                    >
                      {item.content.title}
                    </Link>
                    {item.content.year != null ? (
                      <p className="text-sm text-muted">{item.content.year}</p>
                    ) : null}
                    {state.isOwner ? (
                      <div className="mt-2 flex flex-wrap gap-3 text-sm">
                        <button
                          type="button"
                          disabled={pending || index === 0}
                          aria-label={`Move ${item.content.title} up`}
                          className="text-muted transition hover:text-foreground disabled:opacity-40"
                          onClick={() => {
                            void moveItem(index, -1);
                          }}
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          disabled={pending || index === state.items.length - 1}
                          aria-label={`Move ${item.content.title} down`}
                          className="text-muted transition hover:text-foreground disabled:opacity-40"
                          onClick={() => {
                            void moveItem(index, 1);
                          }}
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          aria-label={`Remove ${item.content.title} from list`}
                          className="text-muted transition hover:text-foreground disabled:opacity-40"
                          onClick={() => {
                            void handleRemove(item);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}

          <dialog
            ref={editDialogRef}
            className="w-full max-w-md border border-[var(--color-border)] bg-[var(--color-bg)] p-6 text-foreground backdrop:bg-black/50"
            aria-labelledby={`${formId}-edit-title`}
          >
            <form
              onSubmit={(event) => {
                void handleSaveEdit(event);
              }}
              className="space-y-4"
            >
              <h2
                id={`${formId}-edit-title`}
                className="font-display text-xl font-semibold"
              >
                Edit list
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
                  required
                  maxLength={100}
                  value={editTitle}
                  onChange={(event) => {
                    setEditTitle(event.target.value);
                  }}
                  className="mt-1 w-full border border-[var(--color-border)] bg-transparent px-3 py-2"
                />
              </div>
              <div>
                <label
                  htmlFor={`${formId}-description`}
                  className="block text-sm text-muted"
                >
                  Description
                </label>
                <textarea
                  id={`${formId}-description`}
                  maxLength={2000}
                  rows={3}
                  value={editDescription}
                  onChange={(event) => {
                    setEditDescription(event.target.value);
                  }}
                  className="mt-1 w-full border border-[var(--color-border)] bg-transparent px-3 py-2"
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
                  value={editVisibility}
                  onChange={(event) => {
                    setEditVisibility(event.target.value as ListVisibility);
                  }}
                  className="mt-1 border border-[var(--color-border)] bg-transparent px-3 py-2"
                >
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
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
            aria-labelledby={`${formId}-delete-title`}
          >
            <h2
              id={`${formId}-delete-title`}
              className="font-display text-xl font-semibold"
            >
              Delete this list?
            </h2>
            <p className="mt-2 text-sm text-muted">
              This permanently removes the list and its items.
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
        </>
      ) : null}
    </div>
  );
}
