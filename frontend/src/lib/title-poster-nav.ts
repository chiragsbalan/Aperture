/**
 * @fileoverview Shared click helpers for title-poster navigations.
 */

import { startTitlePosterFlight } from '@/lib/title-poster-flight';
import { TITLE_POSTER_DATA_ATTR } from '@/lib/title-poster-morph';

/**
 * Start the list→hero FLIP from a poster link.
 *
 * On title-detail pages the click often happens while scrolled to Similar;
 * scroll to top immediately after measuring the source so Next’s navigation
 * does not jump the page mid-flight (reads as jitter).
 */
export function beginTitlePosterNavigation(options: {
  link: HTMLElement;
  contentId: string;
  posterUrl: string | null;
}): void {
  const source =
    options.link.querySelector<HTMLElement>(
      `[${TITLE_POSTER_DATA_ATTR}="${CSS.escape(options.contentId)}"]`,
    ) ?? options.link;
  const rect = source.getBoundingClientRect();
  const from = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };

  startTitlePosterFlight({
    source,
    posterUrl: options.posterUrl,
    contentId: options.contentId,
    from,
  });

  if (window.scrollY > 0) {
    window.scrollTo(0, 0);
  }
}
