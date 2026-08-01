'use client';

import { ProfileAvatar } from '@/components/profile-avatar';
import { apiErrorMessage, type PublicProfile } from '@/lib/profile';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; profile: PublicProfile };

interface PublicProfileViewProps {
  username: string;
}

export function PublicProfileView({ username }: PublicProfileViewProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/proxy/api/v1/users/${encodeURIComponent(username)}`,
          { cache: 'no-store' },
        );
        if (cancelled) {
          return;
        }
        if (res.status === 404) {
          setState({ status: 'error', message: 'Profile not found.' });
          return;
        }
        if (!res.ok) {
          const data: unknown = await res.json().catch(() => null);
          setState({
            status: 'error',
            message: apiErrorMessage(
              data,
              `Could not load profile (HTTP ${res.status}).`,
            ),
          });
          return;
        }
        const profile = (await res.json()) as PublicProfile;
        setState({ status: 'ok', profile });
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
  }, [username]);

  if (state.status === 'loading') {
    return (
      <p className="mt-8 text-muted" role="status">
        Loading profile…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mt-8 space-y-4">
        <p role="alert" className="text-[var(--color-danger)]">
          {state.message}
        </p>
        <p className="text-sm text-muted">
          <Link
            href="/"
            className="text-foreground underline-offset-2 hover:underline"
          >
            Home
          </Link>
        </p>
      </div>
    );
  }

  const { profile } = state;
  const title = profile.display_name?.trim() || profile.username;

  return (
    <div className="mt-8 space-y-6 text-left">
      <div className="flex items-center gap-4">
        <ProfileAvatar
          username={profile.username}
          displayName={profile.display_name}
          size="lg"
        />
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {title}
          </h1>
          <p className="mt-1 text-muted">@{profile.username}</p>
        </div>
      </div>
      {profile.bio ? (
        <p className="whitespace-pre-wrap text-foreground">{profile.bio}</p>
      ) : (
        <p className="text-sm text-muted">No bio yet.</p>
      )}
    </div>
  );
}
