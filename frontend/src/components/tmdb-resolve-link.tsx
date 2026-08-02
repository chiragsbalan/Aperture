'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';

type ResolveKind = 'movie' | 'tv';

const MAX_IN_FLIGHT_WARMS = 2;

/** Successful 2xx warms — never retried. */
const done = new Set<string>();

/** In-flight warm keys — retries allowed after failure. */
const inFlight = new Set<string>();

function warmKey(kind: ResolveKind, tmdbId: number): string {
  return `${kind}:${tmdbId}`;
}

function warmResolve(kind: ResolveKind, tmdbId: number): void {
  const key = warmKey(kind, tmdbId);
  if (done.has(key) || inFlight.has(key)) {
    return;
  }
  if (inFlight.size >= MAX_IN_FLIGHT_WARMS) {
    // At concurrency cap — skip without marking done so a later hover can retry.
    return;
  }

  inFlight.add(key);
  void fetch('/api/catalog/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ tmdb_id: tmdbId, type: kind }),
  })
    .then((res) => {
      if (res.ok) {
        done.add(key);
      }
      // 429 / 5xx: leave out of done so a later hover/focus can retry.
    })
    .catch(() => {
      // Timeout / network: leave out of done so a later hover/focus can retry.
    })
    .finally(() => {
      inFlight.delete(key);
    });
}

/**
 * Link to `/movies|tv/tmdb/{id}` that warms catalog resolve on hover / focus.
 * Disables Next default Link prefetch so a full rail does not stampede ingest
 * on first paint. Module-level done/in-flight sets cap concurrent warms at 2.
 */
export function TmdbResolveLink({
  href,
  tmdbId,
  kind,
  ariaLabel,
  className,
  children,
}: {
  href: string;
  tmdbId: number;
  kind: ResolveKind;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={ariaLabel}
      className={className}
      onPointerEnter={() => {
        warmResolve(kind, tmdbId);
      }}
      onFocus={() => {
        warmResolve(kind, tmdbId);
      }}
    >
      {children}
    </Link>
  );
}
