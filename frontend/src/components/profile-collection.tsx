import Link from 'next/link';

import { ProfileAvatar } from '@/components/profile-avatar';
import { TitleShelfView } from '@/components/title-shelf-view';
import type { LibraryContentType } from '@/lib/library';

export interface ProfileCollectionTitleItem {
  kind: 'title';
  id: string;
  type: LibraryContentType;
  title: string;
  year: number | null;
  posterUrl: string | null;
}

export interface ProfileCollectionPersonItem {
  kind: 'person';
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  subtitle?: string | null;
}

export type ProfileCollectionItem =
  ProfileCollectionTitleItem | ProfileCollectionPersonItem;

interface ProfileCollectionViewProps {
  title: string;
  emptyMessage: string;
  status: 'loading' | 'error' | 'ready';
  errorMessage?: string;
  items: ProfileCollectionItem[];
}

/** Named collection page: titles via TitleShelfView, or people rows. */
export function ProfileCollectionView({
  title,
  emptyMessage,
  status,
  errorMessage,
  items,
}: ProfileCollectionViewProps) {
  const titleItems = items.filter(
    (item): item is ProfileCollectionTitleItem => item.kind === 'title',
  );
  const personItems = items.filter(
    (item): item is ProfileCollectionPersonItem => item.kind === 'person',
  );

  if (personItems.length > 0) {
    return (
      <div className="layout-content motion-fade-rise text-left">
        <h1 className="type-page-lg text-foreground">{title}</h1>

        {status === 'loading' ? (
          <p className="mt-10 text-muted" role="status">
            Loading…
          </p>
        ) : null}

        {status === 'error' ? (
          <p className="mt-10 text-[var(--color-danger)]" role="alert">
            {errorMessage ?? 'Could not load this list.'}
          </p>
        ) : null}

        <ul className="mt-10 divide-y divide-[var(--color-border)]">
          {personItems.map((item) => {
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
      </div>
    );
  }

  return (
    <TitleShelfView
      title={title}
      emptyMessage={emptyMessage}
      status={status}
      errorMessage={errorMessage}
      items={titleItems.map((item) => ({
        key: `${item.type}:${item.id}`,
        contentId: item.id,
        kind: item.type === 'tv' ? 'tv' : 'movie',
        title: item.title,
        year: item.year,
        posterUrl: item.posterUrl,
      }))}
    />
  );
}
