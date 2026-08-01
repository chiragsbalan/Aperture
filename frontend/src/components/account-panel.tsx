'use client';

import { oauthErrorMessage } from '@/lib/google-oauth-errors';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const queryError = oauthErrorMessage(searchParams.get('error'));
  const [state, setState] = useState<LoadState>({ status: 'loading' });

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
      <div className="mt-8 space-y-4" role="alert">
        <p className="text-[var(--color-danger)]">{state.message}</p>
        {queryError ? (
          <p className="text-sm text-[var(--color-danger)]">{queryError}</p>
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

  return (
    <div className="mt-8 space-y-6 text-left">
      {queryError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {queryError}
        </p>
      ) : null}

      <dl className="space-y-4">
        <div>
          <dt className="text-sm text-muted">Email</dt>
          <dd className="mt-1 text-foreground">{me.email}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Identity ID</dt>
          <dd className="mt-1 break-all font-mono text-sm text-foreground">
            {me.identity_id}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Username</dt>
          <dd className="mt-1 text-foreground">
            {me.user?.username ?? 'Not set'}
          </dd>
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
    </div>
  );
}
