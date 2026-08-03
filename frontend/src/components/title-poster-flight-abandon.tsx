'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import {
  endTitlePosterFlight,
  isTitlePosterDestinationPath,
  isTitlePosterFlightActive,
} from '@/lib/title-poster-flight';

/**
 * Tear down an in-flight poster morph when navigating away from title routes.
 *
 * Does not end on arrival at ``/movies|tv/...`` or ``/tmdb/...`` — that is the
 * happy path (loading hold → detail settle).
 */
export function TitlePosterFlightAbandon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isTitlePosterFlightActive()) {
      return;
    }
    if (isTitlePosterDestinationPath(pathname)) {
      return;
    }
    endTitlePosterFlight();
  }, [pathname]);

  return null;
}
