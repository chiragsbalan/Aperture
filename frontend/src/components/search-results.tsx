'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { TitlePosterLink } from '@/components/title-poster-link';
import { POSTER_GRID_SIZES } from '@/lib/poster';
import {
  fetchSearch,
  hrefForHit,
  labelForHitType,
  type SearchHit,
} from '@/lib/search';

const DEBOUNCE_MS = 250;

export function SearchResults({ query }: { query: string }) {
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cleaned = query.trim();
    if (!cleaned) {
      setResults([]);
      setTotal(0);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await fetchSearch(cleaned);
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          setError(res.error);
          setResults([]);
          setTotal(0);
          setLoading(false);
          return;
        }
        setError(null);
        setResults(res.data.results);
        setTotal(res.data.total);
        setLoading(false);
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (!query.trim()) {
    return (
      <p className="text-muted">
        Type a title or person name to search the catalog.
      </p>
    );
  }

  if (loading && results == null) {
    return <p className="text-muted">Searching…</p>;
  }

  if (error) {
    return (
      <p className="text-muted" role="alert">
        {error}
      </p>
    );
  }

  if (results != null && results.length === 0) {
    return (
      <p className="text-muted">
        No results for “{query.trim()}”. Try another title or name.
      </p>
    );
  }

  const titles = (results ?? []).filter(
    (hit) => hit.type === 'movie' || hit.type === 'tv',
  );
  const people = (results ?? []).filter((hit) => hit.type === 'person');

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        {total} result{total === 1 ? '' : 's'}
        {loading ? ' · updating…' : ''}
      </p>

      {titles.length > 0 ? (
        <ul className="poster-grid">
          {titles.map((hit) => (
            <li key={`${hit.type}:${hit.id}`} className="min-w-0">
              <TitlePosterLink
                href={hrefForHit(hit)}
                contentId={hit.id}
                posterUrl={hit.poster_url}
                posterAlt=""
                ariaLabel={
                  hit.year != null ? `${hit.title} (${hit.year})` : hit.title
                }
                sizes={POSTER_GRID_SIZES}
                className="block min-w-0 overflow-hidden transition hover:opacity-90"
              >
                <div className="poster-meta">
                  <p className="mt-2 text-xs uppercase tracking-wide text-muted">
                    {labelForHitType(hit.type)}
                    {hit.year != null ? ` · ${hit.year}` : ''}
                  </p>
                  <p className="truncate font-display text-sm font-medium text-foreground">
                    {hit.title}
                  </p>
                </div>
              </TitlePosterLink>
            </li>
          ))}
        </ul>
      ) : null}

      {people.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {people.map((hit) => (
            <li key={`${hit.type}:${hit.id}`}>
              <Link
                href={hrefForHit(hit)}
                className="flex gap-4 py-4 transition hover:bg-[var(--color-surface)]/40"
              >
                <div className="relative h-20 w-14 shrink-0 overflow-hidden bg-[var(--color-surface)]">
                  {hit.poster_url ? (
                    <Image
                      src={hit.poster_url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {labelForHitType(hit.type)}
                  </p>
                  <p className="font-display [font-size:var(--text-subsection)] text-foreground">
                    {hit.title}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
