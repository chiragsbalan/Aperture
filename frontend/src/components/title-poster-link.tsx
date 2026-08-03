'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type MouseEvent, type ReactNode, startTransition } from 'react';

import { SharedTitlePoster } from '@/components/shared-title-poster';
import { armTitlePosterMorph } from '@/lib/title-poster-morph';
import { beginTitlePosterNavigation } from '@/lib/title-poster-nav';

/**
 * Catalog UUID title link with shared poster morph.
 *
 * Starts a FLIP flight on click (works from any page, including Similar on
 * a title detail), then ``router.push`` inside ``startTransition``.
 */
export function TitlePosterLink({
  href,
  contentId,
  posterUrl,
  posterAlt,
  sizes,
  ariaLabel,
  className,
  posterFrameClassName,
  children,
  priority = false,
}: {
  href: string;
  contentId: string;
  posterUrl: string | null;
  posterAlt: string;
  sizes?: string;
  ariaLabel?: string;
  className?: string;
  /** Optional wrapper around the poster (e.g. fixed thumb size in rows). */
  posterFrameClassName?: string;
  children?: ReactNode;
  priority?: boolean;
}) {
  const router = useRouter();

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
    armTitlePosterMorph({
      contentId,
      posterUrl,
      alt: posterAlt,
    });
    beginTitlePosterNavigation({
      link: event.currentTarget,
      contentId,
      posterUrl,
    });

    startTransition(() => {
      router.push(href);
    });
  }

  const poster = (
    <SharedTitlePoster
      contentId={contentId}
      url={posterUrl}
      alt={posterAlt}
      sizes={sizes}
      priority={priority}
    />
  );

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={className}
      onClick={onClick}
    >
      {posterFrameClassName != null ? (
        <div className={posterFrameClassName}>{poster}</div>
      ) : (
        poster
      )}
      {children}
    </Link>
  );
}
