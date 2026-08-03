'use client';

import { useParams } from 'next/navigation';

import { SharedTitlePoster } from '@/components/shared-title-poster';
import { SiteHeader } from '@/components/site-header';
import { TitlePosterFlightTarget } from '@/components/title-poster-flight-target';
import {
  getArmedTitlePosterMorph,
  titlePosterProvisionalId,
} from '@/lib/title-poster-morph';

/**
 * Title detail / TMDb-resolve loading UI. Paints the armed hero poster so the
 * list→detail morph lands on the blank waiting shell immediately.
 *
 * Layout mirrors ``TitleDetailShell`` (same grid / poster offset) so the hero
 * does not shift when real copy replaces the skeleton. The click FLIP clone
 * parks on top until the real detail hero settles the flight.
 */
export function TitleDetailLoading({
  resolveKind,
}: {
  /** Set on ``/movies|tv/tmdb/[tmdbId]`` loading routes. */
  resolveKind?: 'movie' | 'tv';
} = {}) {
  const params = useParams();
  const rawId = params?.id;
  const rawTmdbId = params?.tmdbId;
  const contentId = typeof rawId === 'string' ? rawId : null;
  const tmdbId =
    typeof rawTmdbId === 'string' && /^\d+$/.test(rawTmdbId)
      ? Number(rawTmdbId)
      : null;

  const shareId =
    contentId ??
    (resolveKind != null && tmdbId != null
      ? titlePosterProvisionalId(resolveKind, tmdbId)
      : null);
  const armed = shareId != null ? getArmedTitlePosterMorph(shareId) : null;

  return (
    <div className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative">
        <div
          className="layout-content pb-16 pt-24 text-left sm:pb-24 sm:pt-28"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="sr-only">Loading catalog…</span>
          <div className="grid grid-cols-[minmax(0,1fr)_6.75rem] gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,1fr)_18rem] sm:gap-x-12 sm:gap-y-0">
            <div className="col-start-2 row-span-2 row-start-1 w-full sm:mt-12">
              {armed != null && shareId != null ? (
                <TitlePosterFlightTarget contentId={shareId} mode="hold">
                  <SharedTitlePoster
                    contentId={shareId}
                    url={armed.posterUrl}
                    alt={armed.alt}
                    priority
                    sizes="(max-width: 640px) 108px, 288px"
                  />
                </TitlePosterFlightTarget>
              ) : (
                <div
                  aria-hidden
                  className="aspect-[2/3] w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] ring-1 ring-[var(--color-border)]"
                />
              )}
            </div>
            <div className="motion-fade-in col-start-1 row-span-2 row-start-1 flex min-w-0 flex-col justify-center space-y-3 py-0.5 sm:row-span-1 sm:justify-start sm:space-y-4 sm:py-0">
              <div
                aria-hidden
                className="h-8 w-full max-w-[12rem] bg-[var(--color-bg-elevated)] sm:h-10 sm:max-w-md"
              />
              <div
                aria-hidden
                className="h-3 w-28 bg-[var(--color-bg-elevated)] sm:h-4 sm:w-48"
              />
            </div>
            <div
              aria-hidden
              className="motion-fade-in col-span-2 col-start-1 row-start-3 space-y-2 sm:col-span-1 sm:row-start-2 sm:mt-1 sm:max-w-2xl"
            >
              <div className="h-3 w-full bg-[var(--color-bg-elevated)] sm:h-4" />
              <div className="h-3 w-11/12 bg-[var(--color-bg-elevated)] sm:h-4" />
              <div className="h-3 w-4/5 bg-[var(--color-bg-elevated)] sm:h-4" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
