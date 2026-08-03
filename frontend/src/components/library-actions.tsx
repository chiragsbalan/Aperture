'use client';

import Link from 'next/link';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

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

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-7 w-7 sm:h-8 sm:w-8"
    >
      <path d="M7 4.5h10A1.5 1.5 0 0 1 18.5 6v14.25L12 16.5l-6.5 3.75V6A1.5 1.5 0 0 1 7 4.5z" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-7 w-7 sm:h-8 sm:w-8"
    >
      <path d="M12 20.25S3.75 15 3.75 9.75A4.5 4.5 0 0 1 12 7.5a4.5 4.5 0 0 1 8.25 2.25C20.25 15 12 20.25 12 20.25z" />
    </svg>
  );
}

function ListIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-7 w-7 sm:h-8 sm:w-8"
    >
      <path d="M9 7h11M9 12h11M9 17h11" />
      <rect
        x="3.5"
        y="5.5"
        width="3"
        height="3"
        rx="0.6"
        fill={filled ? 'currentColor' : 'none'}
      />
      <rect
        x="3.5"
        y="10.5"
        width="3"
        height="3"
        rx="0.6"
        fill={filled ? 'currentColor' : 'none'}
      />
      <rect
        x="3.5"
        y="15.5"
        width="3"
        height="3"
        rx="0.6"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

function LoggedIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-7 w-7 sm:h-8 sm:w-8"
    >
      <circle cx="12" cy="12" r="8.25" />
      <path
        d="M8.5 12.25l2.4 2.4 4.6-4.9"
        fill="none"
        stroke={filled ? 'var(--color-accent-contrast)' : 'currentColor'}
      />
    </svg>
  );
}

type ActionTone = 'watchlist' | 'favorites' | 'lists' | 'log';

const ACTION_TONE_CLASS: Record<ActionTone, string> = {
  watchlist: 'library-action-watchlist',
  favorites: 'library-action-favorites',
  lists: 'library-action-lists',
  log: 'library-action-log',
};

function ActionIconButton({
  label,
  tone,
  active,
  pressed,
  hasPopup,
  expanded,
  disabled,
  busy,
  onClick,
  children,
}: {
  label: string;
  tone: ActionTone;
  active: boolean;
  pressed?: boolean;
  hasPopup?: 'dialog';
  expanded?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed !== undefined ? pressed : undefined}
      aria-haspopup={hasPopup}
      aria-expanded={hasPopup != null ? expanded : undefined}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={onClick}
      className={`library-action-icon ${ACTION_TONE_CLASS[tone]} inline-flex h-11 w-11 items-center justify-center disabled:opacity-50 sm:h-12 sm:w-12 ${
        active ? 'is-active' : ''
      }`}
    >
      <span className="library-action-icon-glyph inline-flex">{children}</span>
    </button>
  );
}

/**
 * Title-page library controls: icon toggles for watchlist / favorites /
 * custom lists, plus a Log watch dialog that creates a diary entry.
 */
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
  const [inAnyList, setInAnyList] = useState(false);
  const [listsDialogOpen, setListsDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
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
        const [watch, fav, listMembershipResult] = await Promise.all([
          fetchLibraryContains('watchlist', [{ type, id: contentId }]),
          fetchLibraryContains('favorites', [{ type, id: contentId }]),
          fetchCustomListsMembership(type, contentId),
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
        if (listMembershipResult.ok) {
          setListMembership(listMembershipResult.membership);
          setListItemIds(listMembershipResult.itemIds);
          setInAnyList(
            Object.values(listMembershipResult.membership).some(Boolean),
          );
        } else {
          setInAnyList(false);
        }
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

  useEffect(() => {
    const listDialog = addListDialogRef.current;
    const logDialog = logWatchDialogRef.current;

    function onListClose() {
      setListsDialogOpen(false);
    }
    function onLogClose() {
      setLogDialogOpen(false);
    }

    listDialog?.addEventListener('close', onListClose);
    listDialog?.addEventListener('cancel', onListClose);
    logDialog?.addEventListener('close', onLogClose);
    logDialog?.addEventListener('cancel', onLogClose);
    return () => {
      listDialog?.removeEventListener('close', onListClose);
      listDialog?.removeEventListener('cancel', onListClose);
      logDialog?.removeEventListener('close', onLogClose);
      logDialog?.removeEventListener('cancel', onLogClose);
    };
  }, [authState, membershipState]);

  if (libraryType == null) {
    return null;
  }

  if (authState === 'loading' || membershipState === 'loading') {
    return (
      <div
        className="mt-4 flex w-full items-center justify-evenly sm:mt-5"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">Loading library actions…</span>
        {Array.from({ length: 4 }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className="h-11 w-11 rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)]/50 sm:h-12 sm:w-12"
          />
        ))}
      </div>
    );
  }

  if (authState === 'signed_out') {
    return (
      <p className="mt-4 text-xs text-muted sm:mt-5 sm:text-sm">
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
    setInAnyList(Object.values(membershipResult.membership).some(Boolean));
    addListDialogRef.current?.showModal();
    setListsDialogOpen(true);
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
      setListMembership((current) => {
        const next = { ...current, [list.id]: false };
        setInAnyList(Object.values(next).some(Boolean));
        return next;
      });
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
      setInAnyList(Object.values(refreshed.membership).some(Boolean));
    } else {
      setListMembership((current) => {
        const next = { ...current, [list.id]: true };
        setInAnyList(true);
        return next;
      });
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
    setLogDialogOpen(false);
  }

  const controlsDisabled = membershipState !== 'ready' || pending != null;
  const watchLogged = diaryMessage != null;

  return (
    <div className="mt-4 space-y-2 sm:mt-5 sm:space-y-3">
      <div className="flex w-full items-center justify-evenly sm:justify-evenly">
        <ActionIconButton
          label={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
          tone="watchlist"
          active={inWatchlist}
          pressed={inWatchlist}
          busy={pending === 'watchlist'}
          disabled={controlsDisabled}
          onClick={() => {
            void toggle('watchlist', inWatchlist, setInWatchlist);
          }}
        >
          <BookmarkIcon filled={inWatchlist} />
        </ActionIconButton>
        <ActionIconButton
          label={inFavorites ? 'Remove from favorites' : 'Add to favorites'}
          tone="favorites"
          active={inFavorites}
          pressed={inFavorites}
          busy={pending === 'favorites'}
          disabled={controlsDisabled}
          onClick={() => {
            void toggle('favorites', inFavorites, setInFavorites);
          }}
        >
          <HeartIcon filled={inFavorites} />
        </ActionIconButton>
        <ActionIconButton
          label={inAnyList ? 'Manage lists' : 'Add to list'}
          tone="lists"
          active={inAnyList}
          hasPopup="dialog"
          expanded={listsDialogOpen}
          busy={pending === 'lists'}
          disabled={controlsDisabled}
          onClick={() => {
            void openAddToList();
          }}
        >
          <ListIcon filled={inAnyList} />
        </ActionIconButton>
        <ActionIconButton
          label="Log watch"
          tone="log"
          active={watchLogged}
          hasPopup="dialog"
          expanded={logDialogOpen}
          busy={pending === 'diary'}
          disabled={controlsDisabled}
          onClick={() => {
            setWatchedAt(todayIsoDate());
            setDiaryMessage(null);
            setError(null);
            logWatchDialogRef.current?.showModal();
            setLogDialogOpen(true);
          }}
        >
          <LoggedIcon filled={watchLogged} />
        </ActionIconButton>
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
        <h2 id={`${formId}-lists-heading`} className="type-card-title">
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
            setListsDialogOpen(false);
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
          <h2 id={`${formId}-diary-heading`} className="type-card-title">
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
                setLogDialogOpen(false);
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
