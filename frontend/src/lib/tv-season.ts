/**
 * @fileoverview Client helper to lazy-load TV season episodes via the BFF.
 */

import type { SeasonDetail } from '@/lib/catalog';

export type TvSeasonFetchResult =
  | { ok: true; data: SeasonDetail }
  | { ok: false; status: number; error: string };

/** Load one season (+ episodes) for title seasons tabs (browser → BFF). */
export async function fetchTvSeasonClient(
  contentId: string,
  seasonNumber: number,
): Promise<TvSeasonFetchResult> {
  try {
    const res = await fetch(
      `/api/proxy/api/v1/tv/${encodeURIComponent(contentId)}/seasons/${seasonNumber}`,
      { cache: 'no-store' },
    );
    if (res.status === 404) {
      return { ok: false, status: 404, error: 'Not found' };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}`,
      };
    }
    return { ok: true, data: (await res.json()) as SeasonDetail };
  } catch {
    return { ok: false, status: 0, error: 'Failed to reach the API' };
  }
}
