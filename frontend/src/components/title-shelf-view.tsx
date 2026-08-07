'use client';

import { type ReactNode } from 'react';

import { ListTitleWithVisibility } from '@/components/list-title-with-visibility';
import { ShelfInfiniteScroll } from '@/components/shelf-infinite-scroll';
import { TitleNavPoster } from '@/components/title-nav-poster';
import type { ListVisibility } from '@/lib/library';
import { POSTER_GRID_SIZES } from '@/lib/poster';
import {
  TITLE_SHELF_PAGE_SIZE,
  TITLE_SHELF_PRIORITY_COUNT,
  type TitleShelfItem,
  type TitleShelfStatus,
} from '@/lib/title-shelf';

export type { TitleShelfItem, TitleShelfStatus } from '@/lib/title-shelf';

interface TitleShelfViewProps {
  title: string;
  description?: string | null;
  /** When set, appends outline lock/globe via ``ListTitleWithVisibility``. */
  visibility?: ListVisibility;
  emptyMessage: string;
  status: TitleShelfStatus;
  errorMessage?: string;
  /** Owner chrome (edit / settings) aligned with the title. */
  headerActions?: ReactNode;
  items?: TitleShelfItem[];
  /**
   * Authoritative collection size. Empty UI when ``total === 0`` (not when the
   * loaded window is empty after local removes).
   */
  total?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /**
   * Override default ``TitleNavPoster`` cells (e.g. ``LibraryPosterCell`` in
   * list edit mode). Infinite scroll still runs below when provided.
   */
  renderGrid?: ReactNode;
  /** Extra content under the header (e.g. action error). */
  belowHeader?: ReactNode;
  /** Extra content under the grid / infinite scroll (e.g. guest login CTA). */
  footer?: ReactNode;
}

function ShelfSkeleton() {
  return (
    <ul className="poster-grid mt-10" aria-hidden>
      {Array.from({ length: TITLE_SHELF_PAGE_SIZE }, (_, index) => (
        <li key={index} className="min-w-0">
          <div className="aspect-[2/3] w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)]" />
          <div className="poster-meta mt-2 space-y-1">
            <div className="h-3.5 w-[80%] rounded-sm bg-[var(--color-bg-elevated)]" />
            <div className="h-3 w-[33%] rounded-sm bg-[var(--color-bg-elevated)]" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Product-wide named title shelf: heading (+ optional visibility / description)
 * and a ``.poster-grid`` of openable titles. Route loaders own data + page shell.
 */
export function TitleShelfView({
  title,
  description,
  visibility,
  emptyMessage,
  status,
  errorMessage,
  headerActions,
  items = [],
  total,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  renderGrid,
  belowHeader,
  footer,
}: TitleShelfViewProps) {
  const resolvedTotal = total ?? items.length;
  const showEmpty =
    status === 'ready' && resolvedTotal === 0 && renderGrid == null;
  const showBrowseGrid =
    status === 'ready' && renderGrid == null && items.length > 0;
  const showCustomGrid =
    status === 'ready' && renderGrid != null && items.length > 0;
  const showInfiniteScroll =
    status === 'ready' &&
    hasMore &&
    onLoadMore != null &&
    (items.length > 0 || resolvedTotal > 0);

  return (
    <div className="layout-content motion-fade-rise text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="type-page-lg text-foreground">
            {visibility != null ? (
              <ListTitleWithVisibility title={title} visibility={visibility} />
            ) : (
              title
            )}
          </h1>
          {description ? (
            <p className="mt-2 text-sm text-muted">{description}</p>
          ) : null}
        </div>
        {headerActions != null ? (
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
          </div>
        ) : null}
      </div>

      {belowHeader}

      {status === 'loading' ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading titles…</span>
          <ShelfSkeleton />
        </div>
      ) : null}

      {status === 'error' ? (
        <p className="mt-10 text-[var(--color-danger)]" role="alert">
          {errorMessage ?? 'Could not load this list.'}
        </p>
      ) : null}

      {showEmpty ? (
        <p className="mt-10 text-muted" role="status">
          {emptyMessage}
        </p>
      ) : null}

      {showBrowseGrid ? (
        <ul className="poster-grid mt-10">
          {items.map((item, index) => {
            const ariaLabel =
              item.year != null ? `${item.title} (${item.year})` : item.title;
            return (
              <li key={item.key} className="min-w-0">
                <TitleNavPoster
                  contentId={item.contentId}
                  tmdbId={item.tmdbId}
                  kind={item.kind}
                  posterUrl={item.posterUrl ?? null}
                  posterAlt={`${item.title} poster`}
                  ariaLabel={ariaLabel}
                  className="block min-w-0 overflow-hidden transition hover:opacity-90"
                  sizes={POSTER_GRID_SIZES}
                  priority={index < TITLE_SHELF_PRIORITY_COUNT}
                >
                  <div className="poster-meta">
                    <p className="mt-2 truncate font-display text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    {item.year != null ? (
                      <p className="truncate text-xs text-muted">{item.year}</p>
                    ) : null}
                  </div>
                </TitleNavPoster>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showCustomGrid ? renderGrid : null}

      {status === 'ready' &&
      renderGrid != null &&
      items.length === 0 &&
      resolvedTotal > 0 ? (
        <p className="mt-10 text-muted" role="status">
          Loading more of this list…
        </p>
      ) : null}

      {showInfiniteScroll && onLoadMore != null ? (
        <ShelfInfiniteScroll
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
          statusText={
            total != null
              ? `Showing ${items.length} of ${resolvedTotal}`
              : undefined
          }
        />
      ) : null}

      {footer}
    </div>
  );
}
