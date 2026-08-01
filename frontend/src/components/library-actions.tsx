'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import {
  addCustomListItem,
  addLibraryItem,
  createWatchEntry,
  fetchCustomListsMembership,
  fetchLibraryContains,
  fetchMyCustomLists,
  membershipKey,
  removeCustomListItem,
  removeLibraryItem,
  toLibraryContentType,
  type CustomListSummary,
  type LibraryContentType,
} from '@/lib/library';

type AuthState = 'loading' | 'signed_out' | 'signed_in';
type MembershipState = 'loading' | 'ready' | 'error';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LibraryActions({
  contentType,
  contentId,
}: {
  contentType: string;
  contentId: string;
}) {
  const libraryType = toLibraryContentType(contentType);
  const formId = useId();
  const addListDialogRef = useRef<HTMLDialogElement>(null);
  const logWatchDialogRef = useRef<HTMLDialogElement>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [membershipState, setMembershipState] =
    useState<MembershipState>('loading');
  const [inWatchlist, setInWatchlist] = useState(false);
  const [inFavorites, setInFavorites] = useState(false);
  const [pending, setPending] = useState<
    'watchlist' | 'favorites' | 'lists' | 'diary' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<CustomListSummary[]>([]);
  const [listMembership, setListMembership] = useState<Record<string, boolean>>(
    {},
  );
  const [listItemIds, setListItemIds] = useState<Record<string, string>>({});
  const [watchedAt, setWatchedAt] = useState(todayIsoDate);
  const [note, setNote] = useState('');
  const [removeFromWatchlist, setRemoveFromWatchlist] = useState(false);
  const [diaryMessage, setDiaryMessage] = useState<string | null>(null);
  const loadGeneration = useRef(0);

  useEffect(() => {
    if (libraryType == null) {
      return;
    }
    const generation = ++loadGeneration.current;
    let cancelled = false;

    async function load() {
      try {
        const me = await fetch('/api/auth/me', { cache: 'no-store' });
        if (cancelled || generation !== loadGeneration.current) {
          return;
        }
        if (!me.ok) {
          setAuthState('signed_out');
          setMembershipState('ready');
          return;
        }
        setAuthState('signed_in');
        setMembershipState('loading');
        const type = libraryType as LibraryContentType;
        const [watch, fav] = await Promise.all([
          fetchLibraryContains('watchlist', [{ type, id: contentId }]),
          fetchLibraryContains('favorites', [{ type, id: contentId }]),
        ]);
        if (cancelled || generation !== loadGeneration.current) {
          return;
        }
        if (!watch.ok || !fav.ok) {
          setMembershipState('error');
          setError('Could not load library status.');
          return;
        }
        const key = membershipKey(type, contentId);
        setInWatchlist(Boolean(watch.membership[key]));
        setInFavorites(Boolean(fav.membership[key]));
        setMembershipState('ready');
        setError(null);
      } catch {
        if (!cancelled && generation === loadGeneration.current) {
          setAuthState('signed_out');
          setMembershipState('ready');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [contentId, libraryType]);

  if (libraryType == null) {
    return null;
  }

  if (authState === 'loading' || membershipState === 'loading') {
    return (
      <div className="mt-5 text-sm text-muted" role="status">
        Loading library actions…
      </div>
    );
  }

  if (authState === 'signed_out') {
    return (
      <p className="mt-5 text-sm text-muted">
        <Link href="/login" className="text-foreground underline">
          Log in
        </Link>{' '}
        to save titles to your library.
      </p>
    );
  }

  async function toggle(
    kind: 'watchlist' | 'favorites',
    current: boolean,
    setCurrent: (value: boolean) => void,
  ) {
    if (libraryType == null || membershipState !== 'ready') {
      return;
    }
    const type = libraryType;
    setPending(kind);
    setError(null);
    setCurrent(!current);
    const result = current
      ? await removeLibraryItem(kind, type, contentId)
      : await addLibraryItem(kind, type, contentId);
    setPending(null);
    if (!result.ok) {
      setCurrent(current);
      setError(result.error);
    }
  }

  async function openAddToList() {
    if (libraryType == null) {
      return;
    }
    setError(null);
    setPending('lists');
    const [listsResult, membershipResult] = await Promise.all([
      fetchMyCustomLists(),
      fetchCustomListsMembership(libraryType, contentId),
    ]);
    setPending(null);
    if (!listsResult.ok || !membershipResult.ok) {
      setError('Could not load your lists.');
      return;
    }
    setLists(listsResult.lists);
    setListMembership(membershipResult.membership);
    setListItemIds(membershipResult.itemIds);
    addListDialogRef.current?.showModal();
  }

  async function toggleListMembership(list: CustomListSummary) {
    if (libraryType == null || pending != null) {
      return;
    }
    const currentlyIn = Boolean(listMembership[list.id]);
    setPending('lists');
    setError(null);
    if (currentlyIn) {
      const itemId = listItemIds[list.id];
      if (itemId == null) {
        setPending(null);
        setError('Could not update list.');
        return;
      }
      const result = await removeCustomListItem(list.id, itemId);
      setPending(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setListMembership((current) => ({ ...current, [list.id]: false }));
      setListItemIds((current) => {
        const next = { ...current };
        delete next[list.id];
        return next;
      });
      return;
    }
    const result = await addCustomListItem(list.id, libraryType, contentId);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const refreshed = await fetchCustomListsMembership(libraryType, contentId);
    if (refreshed.ok) {
      setListMembership(refreshed.membership);
      setListItemIds(refreshed.itemIds);
    } else {
      setListMembership((current) => ({ ...current, [list.id]: true }));
    }
  }

  async function handleLogWatch(event: FormEvent) {
    event.preventDefault();
    if (libraryType == null || pending != null) {
      return;
    }
    setPending('diary');
    setError(null);
    setDiaryMessage(null);
    const result = await createWatchEntry({
      type: libraryType,
      id: contentId,
      watched_at: watchedAt,
      note: note.trim() || null,
      remove_from_watchlist: removeFromWatchlist,
    });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (removeFromWatchlist) {
      setInWatchlist(false);
    }
    setDiaryMessage('Watch logged.');
    setNote('');
    setRemoveFromWatchlist(false);
    logWatchDialogRef.current?.close();
  }

  const controlsDisabled = membershipState !== 'ready' || pending != null;

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          aria-pressed={inWatchlist}
          aria-busy={pending === 'watchlist'}
          disabled={controlsDisabled && pending !== 'favorites'}
          onClick={() => {
            void toggle('watchlist', inWatchlist, setInWatchlist);
          }}
          className="border border-[var(--color-border)] bg-[var(--color-accent-soft)] px-3 py-2 text-sm text-foreground transition hover:border-foreground disabled:opacity-60"
        >
          {inWatchlist ? 'In watchlist' : 'Add to watchlist'}
        </button>
        <button
          type="button"
          aria-pressed={inFavorites}
          aria-busy={pending === 'favorites'}
          disabled={controlsDisabled && pending !== 'watchlist'}
          onClick={() => {
            void toggle('favorites', inFavorites, setInFavorites);
          }}
          className="border border-[var(--color-border)] px-3 py-2 text-sm text-foreground transition hover:border-foreground disabled:opacity-60"
        >
          {inFavorites ? 'Favorited' : 'Add to favorites'}
        </button>
        <button
          type="button"
          aria-busy={pending === 'lists'}
          disabled={controlsDisabled}
          onClick={() => {
            void openAddToList();
          }}
          className="border border-[var(--color-border)] px-3 py-2 text-sm text-foreground transition hover:border-foreground disabled:opacity-60"
        >
          Add to list
        </button>
        <button
          type="button"
          aria-busy={pending === 'diary'}
          disabled={controlsDisabled}
          onClick={() => {
            setWatchedAt(todayIsoDate());
            setDiaryMessage(null);
            logWatchDialogRef.current?.showModal();
          }}
          className="border border-[var(--color-border)] px-3 py-2 text-sm text-foreground transition hover:border-foreground disabled:opacity-60"
        >
          Log watch
        </button>
      </div>
      {diaryMessage ? (
        <p className="text-sm text-muted" role="status">
          {diaryMessage}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <dialog
        ref={addListDialogRef}
        className="w-full max-w-md border border-[var(--color-border)] bg-[var(--color-bg)] p-6 text-foreground backdrop:bg-black/50"
        aria-labelledby={`${formId}-lists-heading`}
      >
        <h2
          id={`${formId}-lists-heading`}
          className="font-display text-xl font-semibold"
        >
          Add to list
        </h2>
        {lists.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No custom lists yet.{' '}
            <Link href="/library/lists" className="underline">
              Create one
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {lists.map((list) => {
              const checked = Boolean(listMembership[list.id]);
              return (
                <li key={list.id}>
                  <label className="flex cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={pending === 'lists'}
                      onChange={() => {
                        void toggleListMembership(list);
                      }}
                    />
                    <span>{list.title}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className="mt-6 border border-[var(--color-border)] px-3 py-2 text-sm"
          onClick={() => {
            addListDialogRef.current?.close();
          }}
        >
          Done
        </button>
      </dialog>

      <dialog
        ref={logWatchDialogRef}
        className="w-full max-w-md border border-[var(--color-border)] bg-[var(--color-bg)] p-6 text-foreground backdrop:bg-black/50"
        aria-labelledby={`${formId}-diary-heading`}
      >
        <form
          onSubmit={(event) => {
            void handleLogWatch(event);
          }}
          className="space-y-4"
        >
          <h2
            id={`${formId}-diary-heading`}
            className="font-display text-xl font-semibold"
          >
            Log watch
          </h2>
          <div>
            <label
              htmlFor={`${formId}-watched-at`}
              className="block text-sm text-muted"
            >
              Watched on
            </label>
            <input
              id={`${formId}-watched-at`}
              type="date"
              required
              value={watchedAt}
              onChange={(event) => {
                setWatchedAt(event.target.value);
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
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
              className="mt-1 w-full border border-[var(--color-border)] bg-transparent px-3 py-2"
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={removeFromWatchlist}
              onChange={(event) => {
                setRemoveFromWatchlist(event.target.checked);
              }}
            />
            Remove from watchlist
          </label>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending === 'diary'}
              className="border border-[var(--color-border)] bg-[var(--color-accent-soft)] px-3 py-2 text-sm"
            >
              Save
            </button>
            <button
              type="button"
              className="border border-[var(--color-border)] px-3 py-2 text-sm"
              onClick={() => {
                logWatchDialogRef.current?.close();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
