'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import { useAuth } from '@/components/auth-provider';
import { localTodayIsoDate } from '@/lib/iso_date';
import {
  addCustomListItem,
  addLibraryItem,
  createWatchEntry,
  DIARY_LOGGED_CHANGED_EVENT,
  fetchCustomListsMembership,
  fetchMyCustomLists,
  fetchTitleLibraryStatus,
  fetchWatchEntriesContains,
  membershipKey,
  removeCustomListItem,
  removeLibraryItem,
  toLibraryContentType,
  type CustomListSummary,
  type LibraryContentType,
} from '@/lib/library';

const LibraryAddToListSheet = dynamic(
  () =>
    import('@/components/library-add-to-list-sheet').then(
      (mod) => mod.LibraryAddToListSheet,
    ),
  { ssr: false },
);

const LibraryLogWatchSheet = dynamic(
  () =>
    import('@/components/library-log-watch-sheet').then(
      (mod) => mod.LibraryLogWatchSheet,
    ),
  { ssr: false },
);

function prefetchLibrarySheets() {
  void import('@/components/library-add-to-list-sheet');
  void import('@/components/library-log-watch-sheet');
}

type AuthState = 'loading' | 'signed_out' | 'signed_in';
type MembershipState = 'loading' | 'ready' | 'error';

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
  onIntent,
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
  /** Prefetch heavy dialog chunks on hover/focus. */
  onIntent?: () => void;
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
      onPointerEnter={onIntent}
      onFocus={onIntent}
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
  const { status: sessionStatus } = useAuth();
  const libraryType = toLibraryContentType(contentType);
  const formId = useId();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [membershipState, setMembershipState] =
    useState<MembershipState>('loading');
  const [inWatchlist, setInWatchlist] = useState(false);
  const [inFavorites, setInFavorites] = useState(false);
  const [listsDialogOpen, setListsDialogOpen] = useState(false);
  const [listsSheetMounted, setListsSheetMounted] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logSheetMounted, setLogSheetMounted] = useState(false);
  const [pending, setPending] = useState<
    'watchlist' | 'favorites' | 'lists' | 'diary' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<CustomListSummary[]>([]);
  const [listMembership, setListMembership] = useState<Record<string, boolean>>(
    {},
  );
  const [listItemIds, setListItemIds] = useState<Record<string, string>>({});
  const [watchedAt, setWatchedAt] = useState(localTodayIsoDate);
  const [note, setNote] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [hasLogged, setHasLogged] = useState(false);
  const [diaryMessage, setDiaryMessage] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const inAnyList = Object.values(listMembership).some(Boolean);

  useEffect(() => {
    if (libraryType == null) {
      return;
    }
    if (sessionStatus === 'loading') {
      setAuthState('loading');
      setMembershipState('loading');
      return;
    }
    if (sessionStatus === 'signed_out') {
      setListMembership({});
      setListItemIds({});
      setAuthState('signed_out');
      setMembershipState('ready');
      return;
    }

    const generation = ++loadGeneration.current;
    let cancelled = false;

    async function load() {
      setAuthState('signed_in');
      setMembershipState('loading');
      setError(null);
      // Clear prior title membership so derive(inAnyList) cannot stick.
      setListMembership({});
      setListItemIds({});
      try {
        const type = libraryType as LibraryContentType;
        const result = await fetchTitleLibraryStatus(type, contentId);
        if (cancelled || generation !== loadGeneration.current) {
          return;
        }

        if (!result.ok) {
          if (result.status === 401) {
            setListMembership({});
            setListItemIds({});
            setAuthState('signed_out');
            setMembershipState('ready');
            return;
          }
          setListMembership({});
          setListItemIds({});
          setAuthState('signed_in');
          setMembershipState('error');
          setError('Could not load library status.');
          return;
        }

        setAuthState('signed_in');
        setInWatchlist(result.status.inWatchlist);
        setInFavorites(result.status.inFavorites);
        setHasLogged(result.status.hasLogged);
        setListMembership(result.status.listMembership);
        setListItemIds(result.status.listItemIds);
        setMembershipState('ready');
        setError(null);
      } catch {
        if (!cancelled && generation === loadGeneration.current) {
          setListMembership({});
          setListItemIds({});
          setMembershipState('error');
          setError('Could not load library status.');
        }
      }
    }

    void load();

    function onDiaryLoggedChanged() {
      void (async () => {
        const type = libraryType as LibraryContentType;
        const logged = await fetchWatchEntriesContains([
          { type, id: contentId },
        ]);
        if (cancelled || generation !== loadGeneration.current || !logged.ok) {
          return;
        }
        setHasLogged(
          Boolean(logged.membership[membershipKey(type, contentId)]),
        );
      })();
    }
    window.addEventListener(DIARY_LOGGED_CHANGED_EVENT, onDiaryLoggedChanged);

    return () => {
      cancelled = true;
      window.removeEventListener(
        DIARY_LOGGED_CHANGED_EVENT,
        onDiaryLoggedChanged,
      );
    };
  }, [contentId, libraryType, sessionStatus]);

  if (libraryType == null) {
    return null;
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
    setListsSheetMounted(true);
    setListsDialogOpen(true);
  }

  function openLogWatch() {
    setWatchedAt(localTodayIsoDate());
    setDiaryMessage(null);
    setError(null);
    setLogSheetMounted(true);
    setLogDialogOpen(true);
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
    try {
      const result = await createWatchEntry({
        type: libraryType,
        id: contentId,
        watched_at: watchedAt,
        note: note.trim() || null,
        rating,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInWatchlist(false);
      setHasLogged(true);
      setDiaryMessage('Watch logged.');
      setNote('');
      setRating(null);
      setLogDialogOpen(false);
    } catch {
      setError('Could not log watch.');
    } finally {
      setPending(null);
    }
  }

  const membershipLoading = membershipState === 'loading';
  const controlsDisabled = membershipState !== 'ready' || pending != null;
  const watchLogged = hasLogged;

  return (
    <div className="mt-4 space-y-2 sm:mt-5 sm:space-y-3">
      <div
        className="flex w-full items-center justify-evenly sm:justify-evenly"
        aria-busy={membershipLoading || undefined}
      >
        {membershipLoading ? (
          <span className="sr-only">Loading library actions…</span>
        ) : null}
        <ActionIconButton
          label={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
          tone="watchlist"
          active={inWatchlist}
          pressed={inWatchlist}
          busy={membershipLoading || pending === 'watchlist'}
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
          busy={membershipLoading || pending === 'favorites'}
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
          busy={membershipLoading || pending === 'lists'}
          disabled={controlsDisabled}
          onClick={() => {
            void openAddToList();
          }}
          onIntent={prefetchLibrarySheets}
        >
          <ListIcon filled={inAnyList} />
        </ActionIconButton>
        <ActionIconButton
          label="Log watch"
          tone="log"
          active={watchLogged}
          hasPopup="dialog"
          expanded={logDialogOpen}
          busy={membershipLoading || pending === 'diary'}
          disabled={controlsDisabled}
          onClick={openLogWatch}
          onIntent={prefetchLibrarySheets}
        >
          <LoggedIcon filled={watchLogged} />
        </ActionIconButton>
      </div>
      {diaryMessage ? (
        <p className="text-sm text-muted" role="status">
          {diaryMessage}
        </p>
      ) : null}
      {error && !logDialogOpen && !listsDialogOpen ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {listsSheetMounted ? (
        <LibraryAddToListSheet
          open={listsDialogOpen}
          onDismiss={() => {
            setListsDialogOpen(false);
          }}
          onClose={() => {
            setListsDialogOpen(false);
            setListsSheetMounted(false);
          }}
          lists={lists}
          listMembership={listMembership}
          pending={pending === 'lists'}
          onToggleList={(list) => {
            void toggleListMembership(list);
          }}
        />
      ) : null}

      {logSheetMounted ? (
        <LibraryLogWatchSheet
          open={logDialogOpen}
          onDismiss={() => {
            setLogDialogOpen(false);
          }}
          onClose={() => {
            setLogDialogOpen(false);
            setLogSheetMounted(false);
          }}
          formId={formId}
          watchedAt={watchedAt}
          onWatchedAtChange={setWatchedAt}
          note={note}
          onNoteChange={setNote}
          rating={rating}
          onRatingChange={setRating}
          error={error}
          pending={pending === 'diary'}
          onSubmit={(event) => {
            void handleLogWatch(event);
          }}
        />
      ) : null}
    </div>
  );
}
