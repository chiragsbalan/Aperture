import Link from 'next/link';
import type { ReactNode } from 'react';

type TitleKind = 'movie' | 'tv';

const LINK_CLASS =
  'text-foreground underline decoration-[var(--color-border)] underline-offset-4 transition hover:decoration-accent';

/**
 * Text-only navigation to a movie/TV title detail.
 *
 * Warm catalog UUID and cold TMDb ``/tmdb/`` paths only. Never use poster
 * morph links (``TitlePosterLink`` / ``TmdbResolveLink``) here.
 */
export function TitleTextLink({
  contentId,
  tmdbId,
  kind,
  children,
  className = '',
}: {
  contentId?: string | null;
  tmdbId?: number | null;
  kind: TitleKind;
  children: ReactNode;
  className?: string;
}) {
  const resolvedContentId =
    contentId != null && contentId !== '' ? String(contentId) : null;
  const composedClass =
    className !== '' ? `${LINK_CLASS} ${className}` : LINK_CLASS;

  if (resolvedContentId != null) {
    const href =
      kind === 'tv'
        ? `/tv/${resolvedContentId}`
        : `/movies/${resolvedContentId}`;
    return (
      <Link href={href} className={composedClass}>
        {children}
      </Link>
    );
  }

  if (tmdbId != null && tmdbId > 0) {
    const href =
      kind === 'tv' ? `/tv/tmdb/${tmdbId}` : `/movies/tmdb/${tmdbId}`;
    return (
      <Link href={href} className={composedClass}>
        {children}
      </Link>
    );
  }

  return <span className="text-foreground">{children}</span>;
}
