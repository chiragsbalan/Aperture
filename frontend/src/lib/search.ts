/**
 * @fileoverview Client helpers for catalog search via the BFF proxy.
 */

export type SearchHitType = 'movie' | 'tv' | 'person';

export interface SearchHit {
  type: SearchHitType;
  id: string;
  title: string;
  year: number | null;
  poster_url: string | null;
}

export interface SearchResponse {
  q: string;
  page: number;
  limit: number;
  total: number;
  results: SearchHit[];
}

export type SearchFetchResult =
  | { ok: true; data: SearchResponse }
  | { ok: false; status: number; error: string };

export async function fetchSearch(
  q: string,
  options?: { types?: string; page?: number; limit?: number },
): Promise<SearchFetchResult> {
  const params = new URLSearchParams();
  params.set('q', q);
  if (options?.types) {
    params.set('types', options.types);
  }
  if (options?.page != null) {
    params.set('page', String(options.page));
  }
  if (options?.limit != null) {
    params.set('limit', String(options.limit));
  }

  try {
    const res = await fetch(`/api/proxy/api/v1/search?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: string };
        if (typeof body.detail === 'string') {
          detail = body.detail;
        }
      } catch {
        // ignore parse errors
      }
      return { ok: false, status: res.status, error: detail };
    }
    const data = (await res.json()) as SearchResponse;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: 'Failed to reach the API' };
  }
}

export function hrefForHit(hit: SearchHit): string {
  if (hit.type === 'movie') {
    return `/movies/${hit.id}`;
  }
  if (hit.type === 'tv') {
    return `/tv/${hit.id}`;
  }
  return `/people/${hit.id}`;
}

export function labelForHitType(type: SearchHitType): string {
  if (type === 'movie') {
    return 'Movie';
  }
  if (type === 'tv') {
    return 'TV';
  }
  return 'Person';
}
