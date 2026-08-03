'use client';

import { type ReactNode } from 'react';

import { TitlePosterLink } from '@/components/title-poster-link';
import { TmdbResolveLink } from '@/components/tmdb-resolve-link';

type TitleKind = 'movie' | 'tv';

/**
 * Product-wide entry for any openable title poster.
 *
 * Use this (or ``TitlePosterLink`` / ``TmdbResolveLink``) whenever a poster
 * navigates to a movie/TV detail page — rails, Similar, search, library, etc.
 * Do not wire raw ``<Link>`` + ``<Image>`` for openable title posters.
 */
export function TitleNavPoster({
  contentId,
  tmdbId,
  kind,
  posterUrl,
  posterAlt,
  ariaLabel,
  className,
  posterFrameClassName,
  sizes,
  children,
  priority = false,
}: {
  /** Catalog UUID when known (warm path / library / search). */
  contentId?: string | null;
  /** TMDb id for cold resolve when ``contentId`` is missing. */
  tmdbId?: number | null;
  kind: TitleKind;
  posterUrl: string | null;
  posterAlt: string;
  ariaLabel: string;
  className?: string;
  posterFrameClassName?: string;
  sizes?: string;
  children?: ReactNode;
  priority?: boolean;
}) {
  const resolvedContentId =
    contentId != null && contentId !== '' ? String(contentId) : null;

  if (resolvedContentId != null) {
    const href =
      kind === 'tv'
        ? `/tv/${resolvedContentId}`
        : `/movies/${resolvedContentId}`;
    return (
      <TitlePosterLink
        href={href}
        contentId={resolvedContentId}
        posterUrl={posterUrl}
        posterAlt={posterAlt}
        ariaLabel={ariaLabel}
        className={className}
        posterFrameClassName={posterFrameClassName}
        sizes={sizes}
        priority={priority}
      >
        {children}
      </TitlePosterLink>
    );
  }

  if (tmdbId != null && tmdbId > 0) {
    const href =
      kind === 'tv' ? `/tv/tmdb/${tmdbId}` : `/movies/tmdb/${tmdbId}`;
    return (
      <TmdbResolveLink
        href={href}
        tmdbId={tmdbId}
        kind={kind}
        ariaLabel={ariaLabel}
        className={className}
        posterUrl={posterUrl}
        posterAlt={posterAlt}
        posterSizes={sizes}
      >
        {children}
      </TmdbResolveLink>
    );
  }

  return null;
}
