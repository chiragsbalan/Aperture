'use client';

import { useEffect } from 'react';

import {
  TITLE_POSTER_DATA_ATTR,
  clearTitlePosterMorph,
  recordTitlePosterHeroSnapshot,
} from '@/lib/title-poster-morph';

/**
 * On title detail, keep a live snapshot of the hero poster box for browser-Back
 * FLIP, then clear the one-shot morph arm.
 */
export function RecordTitlePosterHero({
  contentId,
  posterUrl,
  alt,
}: {
  contentId: string;
  posterUrl: string | null;
  alt: string;
}) {
  useEffect(() => {
    let cancelled = false;

    function snapshot(): void {
      if (cancelled) {
        return;
      }
      const el = document.querySelector<HTMLElement>(
        `[${TITLE_POSTER_DATA_ATTR}="${CSS.escape(contentId)}"]`,
      );
      if (el == null) {
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        return;
      }
      recordTitlePosterHeroSnapshot({
        contentId,
        posterUrl,
        alt,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      });
    }

    // Poster layout can settle a frame after paint (esp. next/image).
    snapshot();
    const frame = window.requestAnimationFrame(() => {
      snapshot();
    });
    clearTitlePosterMorph(contentId);

    window.addEventListener('scroll', snapshot, true);
    window.addEventListener('resize', snapshot);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', snapshot, true);
      window.removeEventListener('resize', snapshot);
    };
  }, [contentId, posterUrl, alt]);

  return null;
}
