'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { ActionToast } from '@/components/action-toast';
import { CollectionSheet } from '@/components/collection-sheet';
import { FormSelect } from '@/components/form-select';
import { LibraryPosterCell } from '@/components/library-poster-cell';
import {
  CheckOutlineIcon,
  PencilOutlineIcon,
  SettingsOutlineIcon,
} from '@/components/shelf-chrome-icons';
import { TitleShelfView } from '@/components/title-shelf-view';
import {
  addCustomListItem,
  deleteCustomList,
  fetchCustomList,
  fetchCustomListItems,
  patchCustomList,
  removeCustomListItem,
  type CustomListDetail,
  type LibraryListItem,
  type ListVisibility,
} from '@/lib/library';
import { isSafeListReturnPath } from '@/lib/list-nav';
import {
  dedupeLibraryListItems,
  nextShelfWindowLimit,
  shelfItemsFromLibraryList,
  TITLE_SHELF_MAX_FETCH,
  TITLE_SHELF_PAGE_SIZE,
} from '@/lib/title-shelf';

const VISIBILITY_OPTIONS = [
  { value: 'public' as const, label: 'Anyone' },
  { value: 'private' as const, label: 'Private' },
];

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | {
      status: 'ready';
      list: CustomListDetail;
      items: LibraryListItem[];
      /** Authoritative collection size from the items API. */
      total: number;
      isOwner: boolean;
    };

type ListSheet = 'edit' | 'delete';

export function CustomListDetailPage({ listId }: { listId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = useId();
  const returnPath = searchParams.get('from');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [editingItems, setEditingItems] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, setPending] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ListSheet | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editVisibility, setEditVisibility] =
    useState<ListVisibility>('private');
  const [undo, setUndo] = useState<LibraryListItem | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function goToMyProfile() {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.ok) {
        const me = (await res.json()) as {
          user?: { username?: string | null } | null;
        };
        const username = me.user?.username?.trim();
        if (username) {
          router.push(`/u/${encodeURIComponent(username)}`);
          return;
        }
      }
    } catch {
      // Fall through to history back.
    }
    router.back();
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: 'loading' });
      const [listResult, itemsResult] = await Promise.all([
        fetchCustomList(listId),
        fetchCustomListItems(listId, 1, TITLE_SHELF_PAGE_SIZE),
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
      const total = itemsResult.data.total;
      setState({
        status: 'ready',
        list: {
          ...listResult.list,
          item_count: total,
        },
        items: dedupeLibraryListItems(itemsResult.data.items),
        total,
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

  useEffect(() => {
    if (state.status === 'ready' && state.total === 0) {
      setEditingItems(false);
    }
  }, [state]);

  async function handleLoadMore() {
    if (state.status !== 'ready' || loadingMore) {
      return;
    }
    if (state.items.length >= state.total) {
      return;
    }
    setLoadingMore(true);
    setActionError(null);
    // Custom lists are capped at TITLE_SHELF_MAX_FETCH (500), so page=1
    // window expand is sufficient — no append page-mode needed.
    const limit = nextShelfWindowLimit(
      state.items.length,
      TITLE_SHELF_MAX_FETCH,
    );
    const result = await fetchCustomListItems(listId, 1, limit);
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
      const items = dedupeLibraryListItems(result.data.items);
      const total = result.data.total;
      return {
        ...current,
        items,
        total,
        list: { ...current.list, item_count: total },
      };
    });
  }

  async function handleRemove(item: LibraryListItem) {
    if (state.status !== 'ready' || !state.isOwner || pendingRemoveId != null) {
      return;
    }
    setPendingRemoveId(item.item_id);
    setActionError(null);
    const previous = state.items;
    const previousTotal = state.total;
    const previousCount = state.list.item_count;
    setState({
      ...state,
      items: state.items.filter((row) => row.item_id !== item.item_id),
      total: Math.max(0, state.total - 1),
      list: {
        ...state.list,
        item_count: Math.max(0, state.list.item_count - 1),
      },
    });
    const result = await removeCustomListItem(listId, item.item_id);
    setPendingRemoveId(null);
    if (!result.ok) {
      setActionError(result.error);
      setState((current) => {
        if (current.status !== 'ready') {
          return current;
        }
        return {
          ...current,
          items: previous,
          total: previousTotal,
          list: { ...current.list, item_count: previousCount },
        };
      });
      return;
    }
    setUndo(item);
  }

  async function handleUndoRemove() {
    if (undo == null || state.status !== 'ready') {
      return;
    }
    const item = undo;
    setUndo(null);
    setPendingRemoveId(item.item_id);
    setActionError(null);
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      const already = current.items.some((row) => row.item_id === item.item_id);
      return {
        ...current,
        items: already ? current.items : [item, ...current.items],
        total: current.total + (already ? 0 : 1),
        list: {
          ...current.list,
          item_count: current.list.item_count + (already ? 0 : 1),
        },
      };
    });
    const result = await addCustomListItem(
      listId,
      item.content.type,
      item.content.id,
    );
    setPendingRemoveId(null);
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
          list: {
            ...current.list,
            item_count: Math.max(0, current.list.item_count - 1),
          },
        };
      });
      return;
    }
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      return {
        ...current,
        items: [
          result.item,
          ...current.items.filter((row) => row.item_id !== item.item_id),
        ],
      };
    });
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
    setState({ ...state, list: { ...result.list, item_count: state.total } });
    setSheetOpen(false);
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
    setSheetOpen(false);
    if (isSafeListReturnPath(returnPath)) {
      router.push(returnPath);
      return;
    }
    router.push('/library/lists');
  }

  const ready = state.status === 'ready' ? state : null;
  const hasMore =
    ready != null && ready.items.length < ready.total;

  return (
    <>
      {state.status === 'error' ? (
        <div className="layout-content motion-fade-rise text-left">
          <p className="mt-10 text-[var(--color-danger)]" role="alert">
            {state.error}{' '}
            <button
              type="button"
              className="text-[var(--color-danger)] transition hover:text-foreground"
              onClick={() => {
                void goToMyProfile();
              }}
            >
              Go back to My Account
            </button>
          </p>
        </div>
      ) : (
        <TitleShelfView
          title={ready?.list.title ?? 'List'}
          description={ready?.list.description}
          visibility={ready?.list.visibility}
          emptyMessage="This list is empty."
          status={
            state.status === 'loading'
              ? 'loading'
              : state.status === 'ready'
                ? 'ready'
                : 'error'
          }
          total={ready?.total}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={() => {
            void handleLoadMore();
          }}
          headerActions={
            ready?.isOwner ? (
              <>
                {ready.total > 0 ? (
                  <button
                    type="button"
                    aria-label={editingItems ? 'Done' : 'Edit'}
                    aria-pressed={editingItems}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] text-muted transition hover:bg-[var(--color-accent-soft)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                    onClick={() => {
                      setEditingItems((value) => !value);
                    }}
                  >
                    {editingItems ? (
                      <CheckOutlineIcon />
                    ) : (
                      <PencilOutlineIcon />
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label="List settings"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] text-muted transition hover:bg-[var(--color-accent-soft)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                  onClick={() => {
                    setEditTitle(ready.list.title);
                    setEditDescription(ready.list.description ?? '');
                    setEditVisibility(ready.list.visibility);
                    setSheet('edit');
                    setSheetOpen(true);
                  }}
                >
                  <SettingsOutlineIcon />
                </button>
              </>
            ) : undefined
          }
          belowHeader={
            actionError ? (
              <p className="mt-4 text-[var(--color-danger)]" role="alert">
                {actionError}
              </p>
            ) : null
          }
          items={
            ready != null
              ? shelfItemsFromLibraryList(ready.items)
              : []
          }
          renderGrid={
            ready != null &&
            ready.isOwner &&
            editingItems &&
            ready.items.length > 0 ? (
              <ol className="poster-grid mt-10">
                {ready.items.map((item) => (
                  <li key={item.item_id} className="min-w-0">
                    <LibraryPosterCell
                      item={item}
                      editing
                      removePending={pendingRemoveId === item.item_id}
                      onRemove={() => {
                        void handleRemove(item);
                      }}
                    />
                  </li>
                ))}
              </ol>
            ) : undefined
          }
        />
      )}

      {undo != null ? (
        <ActionToast
          message={`Removed ${undo.content.title}`}
          actionLabel="Undo"
          onAction={() => {
            void handleUndoRemove();
          }}
          onDismiss={() => {
            setUndo(null);
          }}
        />
      ) : null}

      <CollectionSheet
        open={sheetOpen}
        title={sheet === 'delete' ? 'Delete this list?' : 'List settings'}
        onDismiss={() => {
          setSheetOpen(false);
        }}
        onClose={() => {
          setSheetOpen(false);
          setSheet(null);
        }}
      >
        {sheet === 'delete' ? (
          <div className="space-y-6">
            <p className="text-sm text-muted">
              This permanently removes the list and its items.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pending}
                className="btn btn-danger"
                onClick={() => {
                  void handleDelete();
                }}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSheet('edit');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : sheet === 'edit' ? (
          <form
            onSubmit={(event) => {
              void handleSaveEdit(event);
            }}
            className="space-y-4"
          >
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
              <span
                id={`${formId}-visibility-label`}
                className="block text-sm text-muted"
              >
                Visibility
              </span>
              <FormSelect
                id={`${formId}-visibility`}
                aria-labelledby={`${formId}-visibility-label`}
                value={editVisibility}
                options={VISIBILITY_OPTIONS}
                onChange={setEditVisibility}
                className="mt-1"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={pending}
                className="btn btn-primary"
              >
                Save
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSheetOpen(false);
                }}
              >
                Cancel
              </button>
            </div>
            <div className="border-t border-[var(--color-border)] pt-4">
              <button
                type="button"
                className="btn btn-danger-ghost"
                onClick={() => {
                  setSheet('delete');
                }}
              >
                Delete list
              </button>
            </div>
          </form>
        ) : null}
      </CollectionSheet>
    </>
  );
}
