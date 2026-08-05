'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type MouseEvent,
  type ReactNode,
  useRef,
  useSyncExternalStore,
} from 'react';

import { SharedTitlePoster } from '@/components/shared-title-poster';
import {
  resolveCatalogContentId,
  warmCatalogResolve,
  type ResolveKind,
} from '@/lib/catalog-resolve-client';
import {
  armTitlePosterMorph,
  getResolvedContentId,
  rememberResolvedContentId,
  subscribeResolvedContentId,
  titlePosterProvisionalId,
} from '@/lib/title-poster-morph';
import { beginTitlePosterNavigation } from '@/lib/title-poster-nav';

/**
 * Link to a TMDb title that warms resolve on hover/focus.
 *
 * Cached UUID → FLIP + push to the detail page.
 * Cold → FLIP + push to the ``/tmdb/`` loading shell immediately (page change
 * starts with the morph). Hover/focus warm still fills the cache for the next
 * click; late resolves only update the cache.
 */
export function TmdbResolveLink({
  href,
  tmdbId,
  kind,
  ariaLabel,
  className,
  posterUrl,
  posterAlt,
  posterSizes,
  children,
}: {
  href: string;
  tmdbId: number;
  kind: ResolveKind;
  ariaLabel: string;
  className?: string;
  posterUrl: string | null;
  posterAlt: string;
  posterSizes?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const clickGenerationRef = useRef(0);
  const contentId = useSyncExternalStore(
    (listener) => subscribeResolvedContentId(kind, tmdbId, listener),
    () => getResolvedContentId(kind, tmdbId) ?? null,
    () => null,
  );

  function navigateWarm(link: HTMLElement, resolvedId: string): void {
    armTitlePosterMorph({
      contentId: resolvedId,
      posterUrl,
      alt: posterAlt,
    });
    rememberResolvedContentId(kind, tmdbId, resolvedId);
    beginTitlePosterNavigation({
      link,
      contentId: resolvedId,
      posterUrl,
    });
    const detailHref =
      kind === 'tv' ? `/tv/${resolvedId}` : `/movies/${resolvedId}`;
    router.push(detailHref);
  }

  function navigateCold(link: HTMLElement): void {
    const provisionalId = titlePosterProvisionalId(kind, tmdbId);
    armTitlePosterMorph({
      contentId: provisionalId,
      posterUrl,
      alt: posterAlt,
    });
    beginTitlePosterNavigation({
      link,
      contentId: provisionalId,
      posterUrl,
    });
    router.push(href);
  }

  function onClick(event: MouseEvent<HTMLAnchorElement>): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    const link = event.currentTarget;
    const generation = ++clickGenerationRef.current;

    const cached = getResolvedContentId(kind, tmdbId);
    if (cached) {
      navigateWarm(link, cached);
      return;
    }

    // Morph + loading shell first; do not wait on resolve (that delayed the
    // page swap until the poster had already landed).
    navigateCold(link);
    void resolveCatalogContentId(kind, tmdbId).then((resolvedId) => {
      if (generation !== clickGenerationRef.current || resolvedId == null) {
        return;
      }
      rememberResolvedContentId(kind, tmdbId, resolvedId);
    });
  }

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={ariaLabel}
      className={className}
      onPointerEnter={() => {
        warmCatalogResolve(kind, tmdbId);
      }}
      onFocus={() => {
        warmCatalogResolve(kind, tmdbId);
      }}
      onClick={onClick}
    >
      <SharedTitlePoster
        contentId={contentId}
        url={posterUrl}
        alt={posterAlt}
        sizes={posterSizes}
      />
      {children}
    </Link>
  );
}
