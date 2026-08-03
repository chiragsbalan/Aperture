'use client';

import { ProfileAvatar } from '@/components/profile-avatar';
import { oauthErrorMessage } from '@/lib/google-oauth-errors';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface MeResponse {
  identity_id: string;
  email: string;
  user: {
    id: string;
    username: string | null;
    display_name: string | null;
  } | null;
  providers: Array<'password' | 'google'>;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; me: MeResponse };

function providerLabel(provider: 'password' | 'google'): string {
  return provider === 'password' ? 'Password' : 'Google';
}

export function AccountPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryError = oauthErrorMessage(searchParams.get('error'));
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) {
        setLogoutError(`Could not log out (HTTP ${res.status}).`);
        return;
      }
      router.push('/login');
      router.refresh();
    } catch {
      setLogoutError('Could not log out. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (cancelled) {
          return;
        }
        if (res.status === 401) {
          setState({
            status: 'error',
            message: 'You are not signed in.',
          });
          return;
        }
        if (!res.ok) {
          setState({
            status: 'error',
            message: `Could not load account (HTTP ${res.status}).`,
          });
          return;
        }
        const me = (await res.json()) as MeResponse;
        setState({ status: 'ok', me });
      } catch {
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'Failed to reach the API.',
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <p className="mt-8 text-muted" role="status">
        Loading account…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mt-8 space-y-4">
        <p role="alert" className="text-[var(--color-danger)]">
          {state.message}
        </p>
        {queryError ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {queryError}
          </p>
        ) : null}
        <p className="text-sm text-muted">
          <Link
            href="/login"
            className="text-foreground underline-offset-2 hover:underline"
          >
            Log in
          </Link>
          {' · '}
          <Link
            href="/signup"
            className="text-foreground underline-offset-2 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    );
  }

  const { me } = state;
  const providers = me.providers ?? [];
  const hasGoogle = providers.includes('google');
  const username = me.user?.username?.trim() || '';
  const publicProfileHref = username ? `/u/${username}` : null;

  return (
    <div className="mt-8 space-y-6 text-left">
      {queryError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {queryError}
        </p>
      ) : null}

      {username ? (
        <div className="flex items-center gap-4">
          <ProfileAvatar
            username={username}
            displayName={me.user?.display_name}
          />
          <div>
            <p className="type-card-title text-foreground">
              {me.user?.display_name?.trim() || username}
            </p>
            <p className="text-sm text-muted">@{username}</p>
          </div>
        </div>
      ) : null}

      <dl className="space-y-4">
        <div>
          <dt className="text-sm text-muted">Email</dt>
          <dd className="mt-1 text-foreground">{me.email}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Sign-in methods</dt>
          <dd className="mt-1 text-foreground">
            {providers.length > 0
              ? providers.map(providerLabel).join(', ')
              : 'None'}
          </dd>
        </div>
      </dl>

      <nav aria-label="Account" className="space-y-1">
        <Link
          href="/library"
          aria-current={pathname.startsWith('/library') ? 'page' : undefined}
          className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-3 text-foreground transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
        >
          Library
          <span className="text-sm text-muted">Watchlist, lists & diary</span>
        </Link>
        <Link
          href="/account"
          aria-current={pathname === '/account' ? 'page' : undefined}
          className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-primary-soft)] px-4 py-3 text-foreground"
        >
          Profile
          <span className="text-sm text-muted">
            {username ? `@${username}` : 'This page'}
          </span>
        </Link>
        {publicProfileHref ? (
          <Link
            href={publicProfileHref}
            aria-current={pathname === publicProfileHref ? 'page' : undefined}
            className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-3 text-foreground transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
          >
            Public profile
            <span className="text-sm text-muted">@{username}</span>
          </Link>
        ) : null}
        <Link
          href="/settings"
          aria-current={pathname === '/settings' ? 'page' : undefined}
          className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-3 text-foreground transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
        >
          Settings
          <span className="text-sm text-muted">Preferences</span>
        </Link>
      </nav>

      {!hasGoogle ? (
        <p className="text-sm text-muted">
          <a
            href="/api/auth/google/start?intent=link"
            className="text-foreground underline-offset-2 hover:underline"
          >
            Link Google
          </a>
        </p>
      ) : (
        <p className="text-sm text-muted">Google is linked to this account.</p>
      )}

      {logoutError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {logoutError}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => {
          void handleLogout();
        }}
        disabled={loggingOut}
        className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-foreground transition hover:border-[var(--color-accent)] disabled:opacity-60"
      >
        {loggingOut ? 'Logging out…' : 'Log out'}
      </button>
    </div>
  );
}
