/** Profile helpers shared by account / settings / public pages. */

export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  spoilers: 'show' | 'hide';
  language: string;
}

export interface ProfileLink {
  label: string;
  url: string;
}

export interface OwnedProfile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  website_url: string | null;
  links: ProfileLink[];
  preferences: Preferences;
  username_changed_at: string | null;
  username_rename_available_at: string | null;
}

export interface ProfileCounts {
  movies: number;
  shows: number;
  followers: number;
  following: number;
}

export interface PublicProfile {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  website_url: string | null;
  links: ProfileLink[];
  is_owner: boolean;
  counts: ProfileCounts;
}

/** Diary is the profile wall (index). Other tabs are secondary. */
export const PROFILE_TABS = [
  { slug: '', label: 'Diary' },
  { slug: 'activity', label: 'Activity' },
  { slug: 'favorites', label: 'Favorites' },
  { slug: 'reviews', label: 'Reviews' },
] as const;

export type ProfileTabSlug = (typeof PROFILE_TABS)[number]['slug'];

/** Counter destinations — generic named collections under the profile. */
export const PROFILE_COLLECTIONS = {
  movies: {
    slug: 'movies',
    label: 'Movies',
    title: 'Movies',
    itemKind: 'title',
    contentType: 'movie',
    emptyMessage: (name: string) => `${name} has not logged any movies yet.`,
  },
  shows: {
    slug: 'shows',
    label: 'Shows',
    title: 'Shows',
    itemKind: 'title',
    contentType: 'tv',
    emptyMessage: (name: string) => `${name} has not logged any shows yet.`,
  },
  followers: {
    slug: 'followers',
    label: 'Followers',
    title: 'Followers',
    itemKind: 'person',
    contentType: null,
    emptyMessage: (name: string) => `${name} does not have any followers yet.`,
  },
  following: {
    slug: 'following',
    label: 'Following',
    title: 'Following',
    itemKind: 'person',
    contentType: null,
    emptyMessage: (name: string) => `${name} is not following anyone yet.`,
  },
} as const;

export type ProfileCollectionSlug = keyof typeof PROFILE_COLLECTIONS;

export function profileCollectionHref(
  username: string,
  slug: ProfileCollectionSlug,
): string {
  return `/u/${encodeURIComponent(username)}/${slug}`;
}

export function initialsFromProfile(
  displayName: string | null | undefined,
  username: string,
): string {
  const source = (displayName ?? '').trim() || username;
  const parts = source.split(/[\s_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function apiErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (
      typeof detail === 'object' &&
      detail !== null &&
      'message' in detail &&
      typeof (detail as { message: unknown }).message === 'string'
    ) {
      return (detail as { message: string }).message;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (typeof first?.msg === 'string') {
        return first.msg;
      }
    }
  }
  return fallback;
}
