export type LibraryKind = 'watchlist' | 'favorites';
export type LibraryContentType = 'movie' | 'tv';
export type ListVisibility = 'private' | 'public';

/** Form / a11y wording for visibility (not shown next to list names). */
export function listVisibilityLabel(visibility: ListVisibility): string {
  if (visibility === 'public') {
    return 'Anyone';
  }
  return 'Private';
}

export interface ProfileListIndexEntry {
  kind: 'custom';
  id: string;
  title: string;
  description: string | null;
  visibility: ListVisibility;
  item_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface LibraryContentSummary {
  type: LibraryContentType;
  id: string;
  title: string;
  year: number | null;
  poster_url: string | null;
}

export interface LibraryListItem {
  item_id: string;
  position: number;
  added_at: string;
  content: LibraryContentSummary;
}

export interface SystemListResponse {
  kind: LibraryKind;
  title: string;
  visibility: ListVisibility;
  page: number;
  limit: number;
  total: number;
  items: LibraryListItem[];
}

export interface ContainsResponse {
  membership: Record<string, boolean>;
}

export interface CustomListSummary {
  id: string;
  title: string;
  description: string | null;
  visibility: ListVisibility;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface CustomListDetail {
  id: string;
  title: string;
  description: string | null;
  visibility: ListVisibility;
  kind: 'custom';
  owner_user_id?: string | null;
  is_owner: boolean;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface CustomListItemsResponse {
  list_id: string;
  page: number;
  limit: number;
  total: number;
  items: LibraryListItem[];
}

export interface WatchEntry {
  id: string;
  watched_at: string;
  note: string | null;
  /** Optional 0.5–5.0 half-star rating. */
  rating: number | null;
  created_at: string;
  updated_at: string;
  content: LibraryContentSummary;
}

export interface WatchEntriesPage {
  page: number;
  limit: number;
  total: number;
  items: WatchEntry[];
}

type ApiError = { ok: false; status: number; error: string };

export function membershipKey(type: LibraryContentType, id: string): string {
  return `${type}:${id}`;
}

/** Fired when diary create/delete may change title “logged” state. */
export const DIARY_LOGGED_CHANGED_EVENT = 'aperture:diary-logged-changed';

export function notifyDiaryLoggedChanged(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(DIARY_LOGGED_CHANGED_EVENT));
}

/** Map detail DTO types (`tv_show`) to library API public types (`tv`). */
export function toLibraryContentType(type: string): LibraryContentType | null {
  if (type === 'movie') {
    return 'movie';
  }
  if (type === 'tv' || type === 'tv_show') {
    return 'tv';
  }
  return null;
}

export function hrefForLibraryContent(
  content: Pick<LibraryContentSummary, 'type' | 'id'>,
): string {
  return content.type === 'movie'
    ? `/movies/${content.id}`
    : `/tv/${content.id}`;
}

function errorForStatus(status: number, fallback: string): string {
  if (status === 401) {
    return 'Sign in to use your library.';
  }
  if (status === 409) {
    return 'Library limit reached.';
  }
  return fallback;
}

export async function fetchSystemList(
  kind: LibraryKind,
  page = 1,
  limit = 24,
): Promise<
  | { ok: true; data: SystemListResponse }
  | { ok: false; status: number; error: string }
> {
  const res = await fetch(
    `/api/proxy/api/v1/me/${kind}?page=${page}&limit=${limit}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not load this list.'),
    };
  }
  return { ok: true, data: (await res.json()) as SystemListResponse };
}

export async function fetchPublicWatchlist(
  username: string,
  page = 1,
  limit = 24,
): Promise<
  | { ok: true; data: SystemListResponse }
  | { ok: false; status: number; error: string }
> {
  const res = await fetch(
    `/api/proxy/api/v1/users/${encodeURIComponent(username)}/watchlist?page=${page}&limit=${limit}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        res.status === 404
          ? 'Profile not found.'
          : 'Could not load this watchlist.',
    };
  }
  return { ok: true, data: (await res.json()) as SystemListResponse };
}

export async function fetchProfileLists(
  username: string,
): Promise<
  | { ok: true; lists: ProfileListIndexEntry[] }
  | { ok: false; status: number; error: string }
> {
  const res = await fetch(
    `/api/proxy/api/v1/users/${encodeURIComponent(username)}/lists`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        res.status === 404 ? 'Profile not found.' : 'Could not load lists.',
    };
  }
  const data = (await res.json()) as { lists: ProfileListIndexEntry[] };
  return { ok: true, lists: data.lists };
}

export async function addLibraryItem(
  kind: LibraryKind,
  type: LibraryContentType,
  id: string,
): Promise<{ ok: true } | ApiError> {
  const res = await fetch(`/api/proxy/api/v1/me/${kind}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id }),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not update your library.'),
    };
  }
  return { ok: true };
}

export async function removeLibraryItem(
  kind: LibraryKind,
  type: LibraryContentType,
  id: string,
): Promise<{ ok: true } | ApiError> {
  const res = await fetch(`/api/proxy/api/v1/me/${kind}/items`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id }),
  });
  if (!res.ok && res.status !== 204) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not update your library.'),
    };
  }
  return { ok: true };
}

export interface TitleLibraryStatus {
  inWatchlist: boolean;
  inFavorites: boolean;
  hasLogged: boolean;
  listMembership: Record<string, boolean>;
  listItemIds: Record<string, string>;
}

/** One-shot title-page membership (watchlist / favorites / diary / lists). */
export async function fetchTitleLibraryStatus(
  type: LibraryContentType,
  id: string,
): Promise<
  | { ok: true; status: TitleLibraryStatus }
  | { ok: false; status: number }
> {
  const params = new URLSearchParams({ type, id });
  const res = await fetch(
    `/api/proxy/api/v1/me/library-status?${params.toString()}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const body = (await res.json()) as {
    in_watchlist: boolean;
    in_favorites: boolean;
    has_logged: boolean;
    list_membership?: Record<string, boolean>;
    list_item_ids?: Record<string, string>;
  };
  return {
    ok: true,
    status: {
      inWatchlist: Boolean(body.in_watchlist),
      inFavorites: Boolean(body.in_favorites),
      hasLogged: Boolean(body.has_logged),
      listMembership: body.list_membership ?? {},
      listItemIds: body.list_item_ids ?? {},
    },
  };
}

export async function fetchLibraryContains(
  kind: LibraryKind,
  refs: Array<{ type: LibraryContentType; id: string }>,
): Promise<
  | { ok: true; membership: Record<string, boolean> }
  | { ok: false; status: number }
> {
  if (refs.length === 0) {
    return { ok: true, membership: {} };
  }
  const params = new URLSearchParams();
  for (const ref of refs) {
    params.append('ids', membershipKey(ref.type, ref.id));
  }
  const res = await fetch(
    `/api/proxy/api/v1/me/${kind}/contains?${params.toString()}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const body = (await res.json()) as ContainsResponse;
  return { ok: true, membership: body.membership };
}

/** True when the caller has ≥1 diary row for each title. */
export async function fetchWatchEntriesContains(
  refs: Array<{ type: LibraryContentType; id: string }>,
): Promise<
  | { ok: true; membership: Record<string, boolean> }
  | { ok: false; status: number }
> {
  if (refs.length === 0) {
    return { ok: true, membership: {} };
  }
  const params = new URLSearchParams();
  for (const ref of refs) {
    params.append('ids', membershipKey(ref.type, ref.id));
  }
  const res = await fetch(
    `/api/proxy/api/v1/me/watch-entries/contains?${params.toString()}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const body = (await res.json()) as ContainsResponse;
  return { ok: true, membership: body.membership };
}

export async function fetchMyCustomLists(): Promise<
  | { ok: true; lists: CustomListSummary[] }
  | { ok: false; status: number; error: string }
> {
  const res = await fetch('/api/proxy/api/v1/me/lists', { cache: 'no-store' });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not load your lists.'),
    };
  }
  const body = (await res.json()) as { lists: CustomListSummary[] };
  return { ok: true, lists: body.lists };
}

export async function createCustomList(input: {
  title: string;
  description?: string | null;
  visibility?: ListVisibility;
}): Promise<{ ok: true; list: CustomListDetail } | ApiError> {
  const res = await fetch('/api/proxy/api/v1/me/lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      description: input.description ?? null,
      visibility: input.visibility ?? 'public',
    }),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not create list.'),
    };
  }
  return { ok: true, list: (await res.json()) as CustomListDetail };
}

export async function fetchCustomList(
  listId: string,
): Promise<{ ok: true; list: CustomListDetail } | ApiError> {
  const res = await fetch(`/api/proxy/api/v1/lists/${listId}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        res.status === 404
          ? 'List not found.'
          : errorForStatus(res.status, 'Could not load list.'),
    };
  }
  return { ok: true, list: (await res.json()) as CustomListDetail };
}

export async function patchCustomList(
  listId: string,
  body: {
    title?: string;
    description?: string | null;
    visibility?: ListVisibility;
  },
): Promise<{ ok: true; list: CustomListDetail } | ApiError> {
  const res = await fetch(`/api/proxy/api/v1/lists/${listId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not update list.'),
    };
  }
  return { ok: true, list: (await res.json()) as CustomListDetail };
}

export async function deleteCustomList(
  listId: string,
): Promise<{ ok: true } | ApiError> {
  const res = await fetch(`/api/proxy/api/v1/lists/${listId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not delete list.'),
    };
  }
  return { ok: true };
}

export async function fetchCustomListItems(
  listId: string,
  page = 1,
  limit = 24,
): Promise<{ ok: true; data: CustomListItemsResponse } | ApiError> {
  const res = await fetch(
    `/api/proxy/api/v1/lists/${listId}/items?page=${page}&limit=${limit}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        res.status === 404
          ? 'List not found.'
          : errorForStatus(res.status, 'Could not load list items.'),
    };
  }
  return { ok: true, data: (await res.json()) as CustomListItemsResponse };
}

export async function addCustomListItem(
  listId: string,
  type: LibraryContentType,
  id: string,
): Promise<{ ok: true; item: LibraryListItem } | ApiError> {
  const res = await fetch(`/api/proxy/api/v1/lists/${listId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id }),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not add to list.'),
    };
  }
  return { ok: true, item: (await res.json()) as LibraryListItem };
}

export async function removeCustomListItem(
  listId: string,
  itemId: string,
): Promise<{ ok: true } | ApiError> {
  const res = await fetch(`/api/proxy/api/v1/lists/${listId}/items/${itemId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not remove from list.'),
    };
  }
  return { ok: true };
}

export async function fetchCustomListsMembership(
  type: LibraryContentType,
  id: string,
): Promise<
  | {
      ok: true;
      membership: Record<string, boolean>;
      itemIds: Record<string, string>;
    }
  | { ok: false; status: number }
> {
  const params = new URLSearchParams({ type, id });
  const res = await fetch(
    `/api/proxy/api/v1/me/lists/membership?${params.toString()}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const body = (await res.json()) as {
    membership: Record<string, boolean>;
    item_ids?: Record<string, string>;
  };
  return {
    ok: true,
    membership: body.membership,
    itemIds: body.item_ids ?? {},
  };
}

export async function fetchWatchEntries(
  page = 1,
  limit = 24,
  filters?: { year?: number; month?: number },
): Promise<{ ok: true; data: WatchEntriesPage } | ApiError> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (filters?.year != null) {
    params.set('year', String(filters.year));
  }
  if (filters?.month != null) {
    params.set('month', String(filters.month));
  }
  const res = await fetch(
    `/api/proxy/api/v1/me/watch-entries?${params.toString()}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not load diary.'),
    };
  }
  return { ok: true, data: (await res.json()) as WatchEntriesPage };
}

const PUBLIC_DIARY_TTL_MS = 60_000;
/** Max expired keys removed per opportunistic prune pass. */
const PUBLIC_DIARY_PRUNE_BUDGET = 32;

type PublicDiaryViewData = {
  items: WatchEntry[];
  total: number;
  page: number;
  limit: number;
};

const publicDiaryPageCache = new Map<
  string,
  { at: number; data: WatchEntriesPage }
>();

/** Accumulated profile-diary view (includes loaded pages). */
const publicDiaryViewCache = new Map<
  string,
  { at: number; data: PublicDiaryViewData }
>();

function publicDiaryCacheKey(
  username: string,
  page: number,
  limit: number,
  filters?: { year?: number; month?: number },
): string {
  return [
    username.toLowerCase(),
    page,
    limit,
    filters?.year ?? '',
    filters?.month ?? '',
  ].join(':');
}

function isPublicDiaryCacheFresh(at: number, now: number): boolean {
  return now - at <= PUBLIC_DIARY_TTL_MS;
}

/** Drop a bounded number of expired page/view cache entries. */
function pruneExpiredPublicDiaryCaches(now = Date.now()): void {
  let remaining = PUBLIC_DIARY_PRUNE_BUDGET;
  for (const [key, entry] of publicDiaryPageCache) {
    if (remaining <= 0) {
      break;
    }
    if (!isPublicDiaryCacheFresh(entry.at, now)) {
      publicDiaryPageCache.delete(key);
      remaining -= 1;
    }
  }
  for (const [key, entry] of publicDiaryViewCache) {
    if (remaining <= 0) {
      break;
    }
    if (!isPublicDiaryCacheFresh(entry.at, now)) {
      publicDiaryViewCache.delete(key);
      remaining -= 1;
    }
  }
}

/** Drop cached public diary pages/views (all users, or one username). */
export function invalidatePublicWatchEntries(username?: string): void {
  if (username == null) {
    publicDiaryPageCache.clear();
    publicDiaryViewCache.clear();
    return;
  }
  const normalized = username.toLowerCase();
  const prefix = `${normalized}:`;
  for (const key of publicDiaryPageCache.keys()) {
    if (key.startsWith(prefix)) {
      publicDiaryPageCache.delete(key);
    }
  }
  publicDiaryViewCache.delete(normalized);
}

export function peekPublicDiaryView(
  username: string,
): PublicDiaryViewData | null {
  const key = username.toLowerCase();
  const hit = publicDiaryViewCache.get(key);
  if (hit == null) {
    return null;
  }
  if (!isPublicDiaryCacheFresh(hit.at, Date.now())) {
    publicDiaryViewCache.delete(key);
    return null;
  }
  return hit.data;
}

export function rememberPublicDiaryView(
  username: string,
  data: PublicDiaryViewData,
): void {
  pruneExpiredPublicDiaryCaches();
  publicDiaryViewCache.set(username.toLowerCase(), {
    at: Date.now(),
    data,
  });
}

/** Sync read of a cached public diary page (for instant remounts). */
export function peekPublicWatchEntries(
  username: string,
  page = 1,
  limit = 24,
  filters?: { year?: number; month?: number },
): WatchEntriesPage | null {
  const key = publicDiaryCacheKey(username, page, limit, filters);
  const hit = publicDiaryPageCache.get(key);
  if (hit == null) {
    return null;
  }
  if (!isPublicDiaryCacheFresh(hit.at, Date.now())) {
    publicDiaryPageCache.delete(key);
    return null;
  }
  return hit.data;
}

/** Public diary for a username (always public; no auth required). */
export async function fetchPublicWatchEntries(
  username: string,
  page = 1,
  limit = 24,
  filters?: { year?: number; month?: number },
  options?: { bypassCache?: boolean },
): Promise<{ ok: true; data: WatchEntriesPage } | ApiError> {
  const key = publicDiaryCacheKey(username, page, limit, filters);
  const now = Date.now();
  if (!options?.bypassCache) {
    const hit = publicDiaryPageCache.get(key);
    if (hit != null && isPublicDiaryCacheFresh(hit.at, now)) {
      publicDiaryPageCache.set(key, { at: now, data: hit.data });
      return { ok: true, data: hit.data };
    }
    if (hit != null) {
      publicDiaryPageCache.delete(key);
    }
  }

  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (filters?.year != null) {
    params.set('year', String(filters.year));
  }
  if (filters?.month != null) {
    params.set('month', String(filters.month));
  }
  const res = await fetch(
    `/api/proxy/api/v1/users/${encodeURIComponent(username)}/watch-entries?${params.toString()}`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not load diary.'),
    };
  }
  const data = (await res.json()) as WatchEntriesPage;
  pruneExpiredPublicDiaryCaches();
  publicDiaryPageCache.set(key, { at: Date.now(), data });
  return { ok: true, data };
}

export async function createWatchEntry(input: {
  type: LibraryContentType;
  id: string;
  watched_at?: string;
  note?: string | null;
  rating?: number | null;
}): Promise<{ ok: true; entry: WatchEntry } | ApiError> {
  const res = await fetch('/api/proxy/api/v1/me/watch-entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: input.type,
      id: input.id,
      watched_at: input.watched_at ?? null,
      note: input.note ?? null,
      rating: input.rating ?? null,
    }),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not log watch.'),
    };
  }
  invalidatePublicWatchEntries();
  notifyDiaryLoggedChanged();
  return { ok: true, entry: (await res.json()) as WatchEntry };
}

export async function patchWatchEntry(
  entryId: string,
  body: {
    watched_at?: string;
    note?: string | null;
    rating?: number | null;
  },
): Promise<{ ok: true; entry: WatchEntry } | ApiError> {
  const res = await fetch(`/api/proxy/api/v1/me/watch-entries/${entryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not update diary entry.'),
    };
  }
  invalidatePublicWatchEntries();
  return { ok: true, entry: (await res.json()) as WatchEntry };
}

export async function deleteWatchEntry(
  entryId: string,
): Promise<{ ok: true } | ApiError> {
  const res = await fetch(`/api/proxy/api/v1/me/watch-entries/${entryId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not delete diary entry.'),
    };
  }
  invalidatePublicWatchEntries();
  notifyDiaryLoggedChanged();
  return { ok: true };
}
