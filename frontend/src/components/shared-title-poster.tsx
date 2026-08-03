'use client';

import { CatalogPoster } from '@/components/catalog-poster';

/**
 * Catalog poster that participates in title→detail morphs.
 *
 * Forward morphs use a click-time FLIP flight (``title-poster-flight``) so
 * detail→detail (Similar) works the same as home→detail. Browser Back uses
 * the ``data-title-poster`` marker for a reverse FLIP.
 */
export function SharedTitlePoster({
  contentId,
  url,
  alt,
  priority = false,
  sizes,
  aspectClassName,
  className,
}: {
  contentId?: string | null;
  url: string | null;
  alt: string;
  priority?: boolean;
  sizes?: string;
  aspectClassName?: string;
  className?: string;
}) {
  const poster = (
    <CatalogPoster
      url={url}
      alt={alt}
      priority={priority}
      sizes={sizes}
      aspectClassName={aspectClassName}
      className={className}
    />
  );

  if (contentId == null || contentId === '') {
    return poster;
  }

  return <div data-title-poster={contentId}>{poster}</div>;
}
