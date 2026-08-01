'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface MeResponse {
  identity_id: string;
  email: string;
  user: {
    id: string;
    username: string | null;
    display_name: string | null;
  } | null;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; me: MeResponse };

export function AccountPanel() {
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
  return (
    <dl className="mt-8 space-y-4 text-left">
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
    </dl>
  );
}
