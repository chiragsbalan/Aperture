'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { isTitlePosterFlightActive } from '@/lib/title-poster-flight';

/** Keep the bar visible long enough to read (soft navs often finish in &lt;1 frame). */
const MIN_VISIBLE_MS = 450;

/**
 * Immediate navigation feedback for App Router soft navigations.
 *
 * ``loading.tsx`` often stays hidden until the RSC payload arrives (React keeps
 * the previous UI during the transition). This bar arms on internal link click
 * so the user sees motion right away.
 *
 * Skipped while a title-poster FLIP is active — the morph is already the cue.
 */
export function NavigationPending() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const urlKey = `${pathname}?${searchParams.toString()}`;
  const urlKeyRef = useRef(urlKey);
  const armedAtRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  urlKeyRef.current = urlKey;

  function clearHideTimer(): void {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function armPending(): void {
    clearHideTimer();
    armedAtRef.current = performance.now();
    setPending(true);
  }

  function scheduleClear(): void {
    if (armedAtRef.current == null) {
      setPending(false);
      return;
    }
    const elapsed = performance.now() - armedAtRef.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      armedAtRef.current = null;
      hideTimerRef.current = null;
      setPending(false);
    }, wait);
  }

  useEffect(() => {
    // URL settled — clear after the minimum visible window.
    if (armedAtRef.current != null) {
      scheduleClear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to URL changes
  }, [urlKey]);

  useEffect(() => {
    if (!pending) {
      return;
    }
    // Safety: never leave the bar stuck if a navigation is aborted.
    const timer = window.setTimeout(() => {
      armedAtRef.current = null;
      setPending(false);
    }, 10_000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [pending]);

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent): void {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      // Capture phase runs before Link handlers; do not require !defaultPrevented.
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

      armPending();
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
