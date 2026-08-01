export type LibraryKind = 'watchlist' | 'favorites';
export type LibraryContentType = 'movie' | 'tv';

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
    const error =
      res.status === 401
        ? 'Sign in to view your library.'
        : 'Could not load this list.';
    return { ok: false, status: res.status, error };
  }
  return { ok: true, data: (await res.json()) as SystemListResponse };
}

export async function addLibraryItem(
  kind: LibraryKind,
  type: LibraryContentType,
  id: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const res = await fetch(`/api/proxy/api/v1/me/${kind}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id }),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        res.status === 401
          ? 'Sign in to save titles.'
          : 'Could not update your library.',
    };
  }
  return { ok: true };
}

export async function removeLibraryItem(
  kind: LibraryKind,
  type: LibraryContentType,
  id: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const res = await fetch(`/api/proxy/api/v1/me/${kind}/items`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id }),
  });
  if (!res.ok && res.status !== 204) {
    return {
      ok: false,
      status: res.status,
      error:
        res.status === 401
          ? 'Sign in to update your library.'
          : 'Could not update your library.',
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

export { membershipKey };
