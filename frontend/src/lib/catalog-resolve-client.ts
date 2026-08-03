/**
 * @fileoverview Browser-side catalog resolve with shared in-flight promises.
 *
 * Hover warm and click navigation must join the same request so a click during
 * warm does not wait on a second serial resolve (multi-second cold ingest).
 */

import {
  ensureResolvedContentIdsHydrated,
  getResolvedContentId,
  rememberResolvedContentId,
} from '@/lib/title-poster-morph';

export type ResolveKind = 'movie' | 'tv';

const MAX_IN_FLIGHT_WARMS = 6;

/** Successful 2xx resolves — never retried. */
const done = new Set<string>();

/** In-flight resolve promises keyed by kind:tmdbId. */
const inFlight = new Map<string, Promise<string | null>>();

function resolveKey(kind: ResolveKind, tmdbId: number): string {
  return `${kind}:${tmdbId}`;
}

async function fetchResolveId(
  kind: ResolveKind,
  tmdbId: number,
): Promise<string | null> {
  try {
    const res = await fetch('/api/catalog/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ tmdb_id: tmdbId, type: kind }),
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { id?: unknown };
    if (typeof data.id !== 'string' || data.id.length === 0) {
      return null;
    }
    done.add(resolveKey(kind, tmdbId));
    rememberResolvedContentId(kind, tmdbId, data.id);
    return data.id;
  } catch {
    return null;
  }
}

/**
 * Resolve TMDb id → catalog UUID. Coalesces concurrent callers (hover + click).
 */
export function resolveCatalogContentId(
  kind: ResolveKind,
  tmdbId: number,
): Promise<string | null> {
  ensureResolvedContentIdsHydrated();
  const cached = getResolvedContentId(kind, tmdbId);
  if (cached) {
    return Promise.resolve(cached);
  }

  const key = resolveKey(kind, tmdbId);
  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const promise = fetchResolveId(kind, tmdbId).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/** Fire-and-forget warm on hover/focus (capped concurrency). */
export function warmCatalogResolve(kind: ResolveKind, tmdbId: number): void {
  const key = resolveKey(kind, tmdbId);
  if (done.has(key) || inFlight.has(key)) {
    return;
  }
  if (inFlight.size >= MAX_IN_FLIGHT_WARMS) {
    return;
  }
  void resolveCatalogContentId(kind, tmdbId);
}
