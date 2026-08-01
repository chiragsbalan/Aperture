'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  addLibraryItem,
  fetchLibraryContains,
  membershipKey,
  removeLibraryItem,
  toLibraryContentType,
  type LibraryContentType,
} from '@/lib/library';

type AuthState = 'loading' | 'signed_out' | 'signed_in';
type MembershipState = 'loading' | 'ready' | 'error';

export function LibraryActions({
  contentType,
  contentId,
}: {
  contentType: string;
  contentId: string;
}) {
  const libraryType = toLibraryContentType(contentType);
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [membershipState, setMembershipState] =
    useState<MembershipState>('loading');
  const [inWatchlist, setInWatchlist] = useState(false);
  const [inFavorites, setInFavorites] = useState(false);
  const [pending, setPending] = useState<'watchlist' | 'favorites' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
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
      </div>
      {error ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
