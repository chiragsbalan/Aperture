'use client';

import { useEffect, type ReactNode } from 'react';

import {
  bindTitlePosterFlightTarget,
  isTitlePosterFlightActive,
  scheduleTitlePosterFlightOrphanCheck,
  settleTitlePosterFlight,
} from '@/lib/title-poster-flight';
import { TITLE_POSTER_DATA_ATTR } from '@/lib/title-poster-morph';

/**
 * Wraps a destination hero poster and binds / settles an active FLIP flight.
 *
 * - ``hold``: keep the clone covering the slot (loading shell) — do not
 *   reveal yet, or the final detail remount will flicker the poster.
 * - ``settle`` (default): wait for the hero image, then hand off.
 */
export function TitlePosterFlightTarget({
  contentId,
  mode = 'settle',
  children,
}: {
  contentId: string;
  mode?: 'hold' | 'settle';
  children: ReactNode;
}) {
  useEffect(() => {
    if (!isTitlePosterFlightActive()) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let fallbackTimer = 0;

    const tryBind = (): void => {
      if (cancelled) {
        return;
      }
      const el = document.querySelector<HTMLElement>(
        `[${TITLE_POSTER_DATA_ATTR}="${CSS.escape(contentId)}"]`,
      );
      if (el == null) {
        if (attempts < 8) {
          attempts += 1;
          window.requestAnimationFrame(tryBind);
        } else {
          // Hold or settle: do not leave a stuck overlay forever.
          void settleTitlePosterFlight(
            mode === 'settle' ? { waitForImage: true } : undefined,
          );
        }
        return;
      }
      bindTitlePosterFlightTarget(el);
      if (mode === 'settle') {
        void settleTitlePosterFlight({ waitForImage: true });
      } else {
        // If detail never mounts (error / abandoned resolve), don't leave a
        // stuck overlay forever.
        fallbackTimer = window.setTimeout(() => {
          void settleTitlePosterFlight({ waitForImage: true });
        }, 10000);
      }
    };

    tryBind();
    return () => {
      cancelled = true;
      if (fallbackTimer !== 0) {
        window.clearTimeout(fallbackTimer);
      }
      if (mode === 'hold') {
        // Detail settle may mount next; only tear down if still unclaimed.
        scheduleTitlePosterFlightOrphanCheck();
      }
    };
  }, [contentId, mode]);

  return children;
}
