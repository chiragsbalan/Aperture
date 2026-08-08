/**
 * @fileoverview Server-only catalog search for SSR of `/search?q=`.
 */

import { headers } from 'next/headers';

import { upstreamApiBaseUrl } from '@/lib/api';
import {
  applyTrustedClientIpHeaders,
  clientIpFromForwardedFor,
} from '@/lib/trusted-client-headers';
import type { SearchFetchResult, SearchResponse } from '@/lib/search';

const SEARCH_FETCH_TIMEOUT_MS = 12_000;

/** RSC fetch of the first search page (forwards client IP for rate limits). */
export async function fetchSearchServer(
  q: string,
  options?: { types?: string; page?: number; limit?: number },
): Promise<SearchFetchResult> {
  const cleaned = q.trim();
  if (!cleaned) {
    return {
      ok: true,
      data: {
        q: '',
        page: 1,
        limit: 20,
        total: 0,
        results: [],
        match_quality: 'none',
        related: [],
        external: [],
      },
    };
  }

  let base: string;
  try {
    base = upstreamApiBaseUrl();
  } catch {
    return { ok: false, status: 0, error: 'API_URL is not configured' };
  }

  const params = new URLSearchParams();
  params.set('q', cleaned);
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
    const requestHeaders = new Headers({ Accept: 'application/json' });
    const incoming = await headers();
    applyTrustedClientIpHeaders(
      requestHeaders,
      clientIpFromForwardedFor(incoming.get('x-forwarded-for')),
    );

    const res = await fetch(`${base}/api/v1/search?${params.toString()}`, {
      cache: 'no-store',
      headers: requestHeaders,
      signal: AbortSignal.timeout(SEARCH_FETCH_TIMEOUT_MS),
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
