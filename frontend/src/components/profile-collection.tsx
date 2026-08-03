import Link from 'next/link';

import { ProfileAvatar } from '@/components/profile-avatar';
import { TitlePosterLink } from '@/components/title-poster-link';
import type { LibraryContentType } from '@/lib/library';
import { hrefForLibraryContent } from '@/lib/library';

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
  backHref: string;
  backLabel?: string;
  status: 'loading' | 'error' | 'ready';
  errorMessage?: string;
  items: ProfileCollectionItem[];
}

/** Generic named collection: title and a list of titles or people. */
export function ProfileCollectionView({
  title,
  emptyMessage,
  backHref,
  backLabel = 'Back to profile',
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

  return (
    <div className="layout-content motion-fade-rise text-left">
      <p className="text-sm text-muted">
        <Link
          href={backHref}
          className="underline-offset-2 transition hover:text-foreground hover:underline"
        >
          {backLabel}
        </Link>
      </p>
      <h1 className="mt-2 type-page-lg text-foreground">{title}</h1>

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

      {status === 'ready' && items.length === 0 ? (
        <p className="mt-10 text-muted">{emptyMessage}</p>
      ) : null}

      {status === 'ready' && titleItems.length > 0 ? (
        <ul className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
          {titleItems.map((item) => (
            <li key={`${item.type}:${item.id}`} className="min-w-0">
              <TitlePosterLink
                href={hrefForLibraryContent({
                  type: item.type,
                  id: item.id,
                })}
                contentId={item.id}
                posterUrl={item.posterUrl}
                posterAlt={`${item.title} poster`}
                sizes="(max-width: 640px) 45vw, 180px"
                className="block"
              >
                <p className="mt-2 truncate font-medium text-foreground">
                  {item.title}
                </p>
                {item.year != null ? (
                  <p className="text-sm text-muted">{item.year}</p>
                ) : null}
              </TitlePosterLink>
            </li>
          ))}
        </ul>
      ) : null}

      {status === 'ready' && personItems.length > 0 ? (
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
      ) : null}
    </div>
  );
}
