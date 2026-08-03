'use client';

import { useEffect, useState } from 'react';

import {
  ProfileCollectionView,
  type ProfileCollectionItem,
} from '@/components/profile-collection';
import {
  fetchPublicWatchEntries,
  type LibraryContentType,
  type WatchEntry,
} from '@/lib/library';
import {
  apiErrorMessage,
  PROFILE_COLLECTIONS,
  type ProfileCollectionSlug,
  type PublicProfile,
} from '@/lib/profile';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      items: ProfileCollectionItem[];
      displayName: string;
    };

interface ProfileCollectionPageProps {
  username: string;
  collection: ProfileCollectionSlug;
}

function uniqueTitles(
  entries: WatchEntry[],
  type: LibraryContentType,
): ProfileCollectionItem[] {
  const seen = new Set<string>();
  const items: ProfileCollectionItem[] = [];
  for (const entry of entries) {
    if (entry.content.type !== type) {
      continue;
    }
    if (seen.has(entry.content.id)) {
      continue;
    }
    seen.add(entry.content.id);
    items.push({
      kind: 'title',
      id: entry.content.id,
      type: entry.content.type,
      title: entry.content.title,
      year: entry.content.year,
      posterUrl: entry.content.poster_url,
    });
  }
  return items;
}

async function loadPublicWatchEntries(
  username: string,
): Promise<
  | { ok: true; items: WatchEntry[] }
  | { ok: false; status: number; error: string }
> {
  const all: WatchEntry[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (all.length < total && page <= 20) {
    const result = await fetchPublicWatchEntries(username, page, 50);
    if (!result.ok) {
      return result;
    }
    all.push(...result.data.items);
    total = result.data.total;
    if (result.data.items.length === 0) {
      break;
    }
    page += 1;
  }
  return { ok: true, items: all };
}

export function ProfileCollectionPage({
  username,
  collection,
}: ProfileCollectionPageProps) {
  const meta = PROFILE_COLLECTIONS[collection];
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const backHref = `/u/${encodeURIComponent(username)}`;

  useEffect(() => {
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

        if (meta.itemKind === 'person' || meta.contentType == null) {
          // Follow graph lands in a later slice; keep the page ready and empty.
          setState({ status: 'ready', items: [], displayName });
          return;
        }

        const contentType = meta.contentType;
        const diary = await loadPublicWatchEntries(username);
        if (cancelled) {
          return;
        }
        if (!diary.ok) {
          setState({ status: 'error', message: diary.error });
          return;
        }
        setState({
          status: 'ready',
          items: uniqueTitles(diary.items, contentType),
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
  }, [username, collection, meta.contentType, meta.itemKind]);

  const displayName = state.status === 'ready' ? state.displayName : username;
  const emptyMessage = meta.emptyMessage(displayName);

  return (
    <ProfileCollectionView
      title={meta.title}
      emptyMessage={emptyMessage}
      backHref={backHref}
      backLabel={`@${username}`}
      status={state.status}
      errorMessage={state.status === 'error' ? state.message : undefined}
      items={state.status === 'ready' ? state.items : []}
    />
  );
}
