'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { SearchResultsSkeleton } from '@/components/skeleton';
import { TitleNavPoster } from '@/components/title-nav-poster';
import { POSTER_GRID_SIZES } from '@/lib/poster';
import {
  fetchSearch,
  hrefForHit,
  labelForHitType,
  type SearchCard,
  type SearchHit,
  type SearchResponse,
} from '@/lib/search';
import { compareRankableTitles, titleMatchTier } from '@/lib/search-rank';

interface UnifiedTitle {
  key: string;
  kind: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  contentId: string | null;
  tmdbId: number | null;
  tier: number;
  popularity: number;
  order: number;
}

function unifyTitles(
  query: string,
  results: SearchHit[],
  related: SearchCard[],
  external: SearchCard[],
): UnifiedTitle[] {
  const seen = new Set<string>();
  const out: UnifiedTitle[] = [];
  let order = 0;

  function push(card: UnifiedTitle) {
    if (seen.has(card.key)) {
      return;
    }
    seen.add(card.key);
    out.push(card);
  }

  for (const hit of results) {
    if (hit.type !== 'movie' && hit.type !== 'tv') {
      continue;
    }
    push({
      key: `warm:${hit.type}:${hit.id}`,
      kind: hit.type,
      title: hit.title,
      year: hit.year,
      posterUrl: hit.poster_url,
      contentId: hit.id,
      tmdbId: null,
      tier: titleMatchTier(query, hit.title, 'fts'),
      popularity: hit.popularity ?? 0,
      order: order++,
    });
  }

  for (const card of external) {
    const idKey =
      card.content_id != null
        ? `warm:${card.type}:${card.content_id}`
        : `tmdb:${card.type}:${card.tmdb_id}`;
    push({
      key: idKey,
      kind: card.type,
      title: card.title,
      year: card.year,
      posterUrl: card.poster_url,
      contentId: card.content_id,
      tmdbId: card.tmdb_id,
      tier: titleMatchTier(query, card.title, 'external'),
      popularity: card.popularity ?? 0,
      order: order++,
    });
  }

  for (const card of related) {
    const idKey =
      card.content_id != null
        ? `warm:${card.type}:${card.content_id}`
        : `tmdb:${card.type}:${card.tmdb_id}`;
    push({
      key: idKey,
      kind: card.type,
      title: card.title,
      year: card.year,
      posterUrl: card.poster_url,
      contentId: card.content_id,
      tmdbId: card.tmdb_id,
      tier: titleMatchTier(query, card.title, 'related'),
      popularity: card.popularity ?? 0,
      order: order++,
    });
  }

  out.sort(compareRankableTitles);
  return out;
}

export function SearchResults({
  query: queryProp,
  initialResults = null,
  initialRelated = null,
  initialExternal = null,
  initialError = null,
}: {
  /** SSR / first-paint query; live typing prefers ``useSearchParams``. */
  query: string;
  initialResults?: SearchHit[] | null;
  initialRelated?: SearchCard[] | null;
  initialExternal?: SearchCard[] | null;
  initialError?: string | null;
}) {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? queryProp;
  const cleaned = query.trim();

  const ssrQueryRef = useRef(queryProp.trim());
  const [results, setResults] = useState<SearchHit[] | null>(initialResults);
  const [related, setRelated] = useState<SearchCard[] | null>(initialRelated);
  const [external, setExternal] = useState<SearchCard[] | null>(
    initialExternal,
  );
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cleaned) {
      setResults([]);
      setRelated([]);
      setExternal([]);
      setError(null);
      setLoading(false);
      return;
    }

    // First paint already has SSR results for this q; skip the client refetch.
    if (
      cleaned === ssrQueryRef.current &&
      (initialResults != null || initialError != null)
    ) {
      ssrQueryRef.current = '';
      setResults(initialResults ?? []);
      setRelated(initialRelated ?? []);
      setExternal(initialExternal ?? []);
      setError(initialError);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      const res = await fetchSearch(cleaned);
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        setError(res.error);
        setResults([]);
        setRelated([]);
        setExternal([]);
        setLoading(false);
        return;
      }
      applyResponse(res.data);
      setError(null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };

    function applyResponse(data: SearchResponse) {
      setResults(data.results);
      setRelated(data.related ?? []);
      setExternal(data.external ?? []);
    }
  }, [cleaned, initialResults, initialRelated, initialExternal, initialError]);

  const titles = useMemo(
    () => unifyTitles(cleaned, results ?? [], related ?? [], external ?? []),
    [cleaned, results, related, external],
  );
  const people = (results ?? []).filter((hit) => hit.type === 'person');

  if (!cleaned) {
    return null;
  }

  // Always show the shared skeleton while a request is in flight (including
  // when a prior empty ``[]`` would otherwise flash “No results”).
  if (loading) {
    return <SearchResultsSkeleton />;
  }

  if (error) {
    return (
      <p className="text-muted" role="alert">
        {error}
      </p>
    );
  }

  if (titles.length === 0 && people.length === 0) {
    return (
      <p className="text-muted">
        No results for “{cleaned}”.
        <br />
        Try another title or name.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {titles.length > 0 ? (
        <ul className="poster-grid">
          {titles.map((card) => {
            const ariaLabel =
              card.year != null ? `${card.title} (${card.year})` : card.title;
            return (
              <li key={card.key} className="min-w-0">
                <TitleNavPoster
                  contentId={card.contentId}
                  tmdbId={card.tmdbId}
                  kind={card.kind}
                  posterUrl={card.posterUrl}
                  posterAlt=""
                  ariaLabel={ariaLabel}
                  sizes={POSTER_GRID_SIZES}
                  className="block min-w-0 overflow-hidden transition hover:opacity-90"
                >
                  <div className="poster-meta">
                    <p className="mt-2 truncate font-display text-sm font-medium text-foreground">
                      {card.title}
                    </p>
                    {card.year != null ? (
                      <p className="truncate text-xs text-muted">{card.year}</p>
                    ) : null}
                  </div>
                </TitleNavPoster>
              </li>
            );
          })}
        </ul>
      ) : null}

      {people.length > 0 ? (
        <section className="space-y-4">
          <h2 className="type-subsection text-foreground">People</h2>
          <ul className="divide-y divide-[var(--color-border)]">
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
        </section>
      ) : null}
    </div>
  );
}
