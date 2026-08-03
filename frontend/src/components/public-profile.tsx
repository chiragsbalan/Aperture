'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

import { ProfileAvatar } from '@/components/profile-avatar';
import { ProfileNav } from '@/components/profile-nav';
import { ProfileTabStage } from '@/components/profile-tab-stage';
import {
  apiErrorMessage,
  PROFILE_COLLECTIONS,
  profileCollectionHref,
  type ProfileCollectionSlug,
  type PublicProfile,
} from '@/lib/profile';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; profile: PublicProfile };

interface PublicProfileViewProps {
  username: string;
  children?: ReactNode;
}

function formatCount(value: number | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  return value.toLocaleString('en-US');
}

export function PublicProfileView({
  username,
  children,
}: PublicProfileViewProps) {
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
  const counters: Array<{
    slug: ProfileCollectionSlug;
    label: string;
    value: string;
  }> = [
    {
      slug: 'movies',
      label: PROFILE_COLLECTIONS.movies.label,
      value: formatCount(profile.counts.movies) ?? '0',
    },
    {
      slug: 'shows',
      label: PROFILE_COLLECTIONS.shows.label,
      value: formatCount(profile.counts.shows) ?? '0',
    },
    {
      slug: 'followers',
      label: PROFILE_COLLECTIONS.followers.label,
      value: formatCount(profile.counts.followers) ?? '0',
    },
    {
      slug: 'following',
      label: PROFILE_COLLECTIONS.following.label,
      value: formatCount(profile.counts.following) ?? '0',
    },
  ];

  return (
    <div className="text-left">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
        <ProfileAvatar
          username={profile.username}
          displayName={profile.display_name}
          avatarUrl={profile.avatar_url}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="type-page-lg text-foreground">{title}</h1>
              <p className="mt-1 text-muted">@{profile.username}</p>
            </div>
            {profile.is_owner ? (
              <Link
                href="/settings"
                className="shrink-0 text-sm text-muted underline-offset-2 transition hover:text-foreground hover:underline"
              >
                Edit profile
              </Link>
            ) : null}
          </div>
          {profile.bio ? (
            <p className="mt-4 max-w-2xl whitespace-pre-wrap text-foreground">
              {profile.bio}
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted">No bio yet.</p>
          )}
          {(profile.website_url || profile.links.length > 0) && (
            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {profile.website_url ? (
                <li>
                  <a
                    href={profile.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-accent)] underline-offset-2 hover:underline"
                  >
                    Website
                  </a>
                </li>
              ) : null}
              {profile.links.map((link) => (
                <li key={`${link.label}-${link.url}`}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-accent)] underline-offset-2 hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {counters.map((item) => {
              const href = profileCollectionHref(profile.username, item.slug);
              return (
                <div key={item.slug}>
                  <dt className="sr-only">{item.label}</dt>
                  <dd>
                    <Link
                      href={href}
                      className="group block"
                      aria-label={`${item.label}: ${item.value}`}
                    >
                      <span
                        aria-hidden="true"
                        className="block text-muted transition-colors duration-[var(--duration-fast)] group-hover:text-foreground"
                      >
                        {item.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className="block font-medium text-foreground transition-colors duration-[var(--duration-fast)] group-hover:text-accent"
                      >
                        {item.value}
                      </span>
                    </Link>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </header>

      <ProfileNav username={profile.username} />
      <ProfileTabStage>{children}</ProfileTabStage>
    </div>
  );
}
