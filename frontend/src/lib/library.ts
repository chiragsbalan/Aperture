export type LibraryKind = 'watchlist' | 'favorites';
export type LibraryContentType = 'movie' | 'tv';
export type ListVisibility = 'private' | 'public' | 'unlisted';

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

function membershipKey(type: LibraryContentType, id: string): string {
  return `${type}:${id}`;
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
      visibility: input.visibility ?? 'private',
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
): Promise<{ ok: true } | ApiError> {
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
  return { ok: true };
}

export async function removeCustomListItem(
  listId: string,
  itemId: string,
): Promise<{ ok: true } | ApiError> {
  const res = await fetch(
    `/api/proxy/api/v1/lists/${listId}/items/${itemId}`,
    { method: 'DELETE' },
  );
  if (!res.ok && res.status !== 204) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not remove from list.'),
    };
  }
  return { ok: true };
}

export async function reorderCustomListItems(
  listId: string,
  itemIds: string[],
): Promise<{ ok: true; data: CustomListItemsResponse } | ApiError> {
  const res = await fetch(`/api/proxy/api/v1/lists/${listId}/items/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_ids: itemIds }),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not reorder list.'),
    };
  }
  return { ok: true, data: (await res.json()) as CustomListItemsResponse };
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

export async function createWatchEntry(input: {
  type: LibraryContentType;
  id: string;
  watched_at?: string;
  note?: string | null;
  remove_from_watchlist?: boolean;
}): Promise<{ ok: true; entry: WatchEntry } | ApiError> {
  const res = await fetch('/api/proxy/api/v1/me/watch-entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: input.type,
      id: input.id,
      watched_at: input.watched_at ?? null,
      note: input.note ?? null,
      remove_from_watchlist: input.remove_from_watchlist ?? false,
    }),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: errorForStatus(res.status, 'Could not log watch.'),
    };
  }
  return { ok: true, entry: (await res.json()) as WatchEntry };
}

export async function patchWatchEntry(
  entryId: string,
  body: { watched_at?: string; note?: string | null },
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
  return { ok: true };
}

export { membershipKey };
