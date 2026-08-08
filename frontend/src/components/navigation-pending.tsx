'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { isTitlePosterFlightActive } from '@/lib/title-poster-flight';

/**
 * Immediate navigation feedback for App Router soft navigations.
 *
 * ``loading.tsx`` often stays hidden until the RSC payload arrives (React keeps
 * the previous UI during the transition). This bar arms on internal link click
 * so the user sees motion right away; it clears when the URL settles.
 *
 * Skipped while a title-poster FLIP is active — the morph is already the cue.
 */
export function NavigationPending() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const urlKey = `${pathname}?${searchParams.toString()}`;
  const urlKeyRef = useRef(urlKey);
  urlKeyRef.current = urlKey;

  useEffect(() => {
    setPending(false);
  }, [urlKey]);

  useEffect(() => {
    if (!pending) {
      return;
    }
    // Safety: never leave the bar stuck if a navigation is aborted.
    const timer = window.setTimeout(() => {
      setPending(false);
    }, 10_000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [pending]);

  useEffect(() => {
    function shouldIgnoreClick(event: MouseEvent): boolean {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return true;
      }
      return false;
    }

    function onClick(event: MouseEvent): void {
      if (shouldIgnoreClick(event)) {
        return;
      }
      if (isTitlePosterFlightActive()) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      if (anchor.target && anchor.target !== '_self') {
        return;
      }
      if (anchor.hasAttribute('download')) {
        return;
      }

      const hrefAttr = anchor.getAttribute('href');
      if (hrefAttr == null || hrefAttr.startsWith('#')) {
        return;
      }

      let next: URL;
      try {
        next = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (next.origin !== window.location.origin) {
        return;
      }

      const nextKey = `${next.pathname}?${next.searchParams.toString()}`;
      if (nextKey === urlKeyRef.current) {
        return;
      }

      setPending(true);
    }

    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  if (!pending) {
    return null;
  }

  return (
    <div
      className="nav-pending"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading page…</span>
      <div className="nav-pending-bar" aria-hidden />
    </div>
  );
}
