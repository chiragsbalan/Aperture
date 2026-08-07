/**
 * @fileoverview Helpers for product-wide title shelf pages.
 */

import type { SimilarTitle, TopMovie } from '@/lib/catalog';
import type { LibraryListItem } from '@/lib/library';

/** Browse cell for product-wide title shelf pages. */
export interface TitleShelfItem {
  key: string;
  contentId?: string | null;
  tmdbId?: number | null;
  kind: 'movie' | 'tv';
  title: string;
  year?: number | null;
  posterUrl?: string | null;
}

export type TitleShelfStatus = 'loading' | 'error' | 'ready';

/** Home / browse rail destinations (full shelf pages). */
export const BROWSE_SHELF_ROUTES = {
  nowInTheatres: '/browse/now-in-theatres',
  topMovies: '/browse/top-movies',
  topTv: '/browse/top-tv',
} as const;

/** Default page size for unbounded shelves (matches ADR-0008 / system lists). */
export const TITLE_SHELF_PAGE_SIZE = 24;

/** Custom-list API max; also hard cap for window-expand fetches. */
export const TITLE_SHELF_MAX_FETCH = 500;

/** First-viewport ``priority`` count (covers 6-col desktop first row). */
export const TITLE_SHELF_PRIORITY_COUNT = 6;

/** System list API ``le`` (watchlist / favorites). */
export const TITLE_SHELF_SYSTEM_MAX_FETCH = 100;

/**
 * Next ``limit`` for a page=1 window expand after ``loadedCount`` items are
 * already shown. Avoids naïve page+1 skips after local removes.
 */
export function nextShelfWindowLimit(
  loadedCount: number,
  maxFetch: number = TITLE_SHELF_MAX_FETCH,
): number {
  return Math.min(Math.max(loadedCount, 0) + TITLE_SHELF_PAGE_SIZE, maxFetch);
}

/**
 * Next 1-based page after ``loadedCount`` items for append-mode pagination.
 * Uses ceil so a partial final window at a fetch cap does not overlap.
 */
export function nextShelfPage(
  loadedCount: number,
  pageSize: number = TITLE_SHELF_PAGE_SIZE,
): number {
  return Math.ceil(Math.max(loadedCount, 0) / pageSize) + 1;
}

/** Dedupe library rows by ``item_id``, preserving first-seen order. */
export function dedupeLibraryListItems(
  items: LibraryListItem[],
): LibraryListItem[] {
  const seen = new Set<string>();
  const out: LibraryListItem[] = [];
  for (const item of items) {
    if (seen.has(item.item_id)) {
      continue;
    }
    seen.add(item.item_id);
    out.push(item);
  }
  return out;
}

export function shelfItemsFromTopMovies(
  items: TopMovie[],
  kind: 'movie' | 'tv',
): TitleShelfItem[] {
  return items.map((item) => ({
    key: `${kind}:${item.tmdb_id}`,
    tmdbId: item.tmdb_id,
    kind,
    title: item.title,
    year: item.year,
    posterUrl: item.poster_url,
  }));
}

export function shelfItemsFromSimilar(
  items: SimilarTitle[],
  fallbackKind: 'movie' | 'tv',
): TitleShelfItem[] {
  return items.map((item) => {
    const resolvedType = item.content_type ?? fallbackKind;
    const kind: 'movie' | 'tv' =
      resolvedType === 'tv_show' || resolvedType === 'tv' ? 'tv' : 'movie';
    return {
      key: `${kind}:${item.tmdb_id}-${item.title}`,
      contentId: item.content_id,
      tmdbId: item.tmdb_id,
      kind,
      title: item.title,
      year: item.year,
      posterUrl: item.poster_url,
    };
  });
}

export function shelfItemsFromLibraryList(
  items: LibraryListItem[],
): TitleShelfItem[] {
  return items.map((item) => ({
    key: item.item_id,
    contentId: item.content.id,
    kind: item.content.type === 'tv' ? 'tv' : 'movie',
    title: item.content.title,
    year: item.content.year,
    posterUrl: item.content.poster_url,
  }));
}
