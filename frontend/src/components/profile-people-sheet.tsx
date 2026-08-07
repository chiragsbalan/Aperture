'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { CollectionSheet } from '@/components/collection-sheet';
import { ProfileAvatar } from '@/components/profile-avatar';
import type { ProfileCollectionPersonItem } from '@/components/profile-collection';
import { ListRowsSkeleton } from '@/components/skeleton';
import {
  apiErrorMessage,
  PROFILE_COLLECTIONS,
  type PublicProfile,
} from '@/lib/profile';

export type PeopleCollection = 'followers' | 'following';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      items: ProfileCollectionPersonItem[];
      displayName: string;
    };

interface ProfilePeopleSheetProps {
  username: string;
  collection: PeopleCollection;
  open: boolean;
  /** Begin close (set open=false); keeps mount for leave animation. */
  onDismiss: () => void;
  /** After leave animation — parent may clear sheet state. */
  onClose: () => void;
}

/**
 * Followers / Following sheet over the profile (no route change).
 * Until pc.6 follow APIs exist, lists are empty (real counts are 0).
 */
export function ProfilePeopleSheet({
  username,
  collection,
  open,
  onDismiss,
  onClose,
}: ProfilePeopleSheetProps) {
  const meta = PROFILE_COLLECTIONS[collection];
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;

    async function load() {
      setState({ status: 'loading' });
      try {
        const profileRes = await fetch(
          `/api/proxy/api/v1/users/${encodeURIComponent(username)}`,
          { cache: 'no-store' },
        );
        if (cancelled) {
          return;
        }
        if (!profileRes.ok) {
          const data: unknown = await profileRes.json().catch(() => null);
          setState({
            status: 'error',
            message: apiErrorMessage(
              data,
              `Could not load profile (HTTP ${profileRes.status}).`,
            ),
          });
          return;
        }
        const profile = (await profileRes.json()) as PublicProfile;
        const displayName = profile.display_name?.trim() || profile.username;
        // TODO(pc.6): fetch real followers/following lists from the API.
        setState({
          status: 'ready',
          items: [],
          displayName,
        });
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
  }, [username, collection, open]);

  const displayName = state.status === 'ready' ? state.displayName : username;
  const emptyMessage = meta.emptyMessage(displayName);

  return (
    <CollectionSheet
      open={open}
      title={meta.title}
      onDismiss={onDismiss}
      onClose={onClose}
    >
      {state.status === 'loading' ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading…</span>
          <ListRowsSkeleton rows={5} className="mt-0" />
        </div>
      ) : null}

      {state.status === 'error' ? (
        <p className="text-[var(--color-danger)]" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.status === 'ready' && state.items.length === 0 ? (
        <p className="text-muted">{emptyMessage}</p>
      ) : null}

      {state.status === 'ready' && state.items.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)]">
          {state.items.map((item) => {
            const label = item.displayName?.trim() || item.username;
            return (
              <li key={item.id}>
                <Link
                  href={`/u/${encodeURIComponent(item.username)}`}
                  className="flex items-center gap-4 py-4 transition hover:opacity-90"
                >
                  <ProfileAvatar
                    username={item.username}
                    displayName={item.displayName}
                    avatarUrl={item.avatarUrl}
                    size="md"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {label}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      @{item.username}
                      {item.subtitle ? ` · ${item.subtitle}` : ''}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </CollectionSheet>
  );
}
