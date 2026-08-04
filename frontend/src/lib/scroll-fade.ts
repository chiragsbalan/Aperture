/**
 * @fileoverview Keep `.scroll-fade-x` / `.scroll-fade-y` edge masks in sync
 * with scroll position.
 *
 * Pair with the utilities in `globals.css`. Strength tokens in `tokens.css`:
 * `--scroll-fade-size` (horizontal), `--scroll-fade-size-y` (vertical =
 * half a people row via `--scroll-fade-people-row`). Scrollbars stay hidden;
 * fades appear on edges that still have overflow in that direction.
 */

import { type RefObject, useEffect } from 'react';

const SCROLL_EDGE_PX = 1;

type ScrollFadeAxis = 'x' | 'y';

function syncScrollFade(element: HTMLElement, axis: ScrollFadeAxis): void {
  if (axis === 'x') {
    const maxScroll = element.scrollWidth - element.clientWidth;
    const canScroll = maxScroll > SCROLL_EDGE_PX;
    const atStart = element.scrollLeft <= SCROLL_EDGE_PX;
    const atEnd = element.scrollLeft >= maxScroll - SCROLL_EDGE_PX;
    element.dataset.fadeStart = canScroll && !atStart ? 'true' : 'false';
    element.dataset.fadeEnd = canScroll && !atEnd ? 'true' : 'false';
    return;
  }

  const maxScroll = element.scrollHeight - element.clientHeight;
  const canScroll = maxScroll > SCROLL_EDGE_PX;
  const atStart = element.scrollTop <= SCROLL_EDGE_PX;
  const atEnd = element.scrollTop >= maxScroll - SCROLL_EDGE_PX;
  element.dataset.fadeStart = canScroll && !atStart ? 'true' : 'false';
  element.dataset.fadeEnd = canScroll && !atEnd ? 'true' : 'false';
}

function useScrollFade(
  ref: RefObject<HTMLElement | null>,
  axis: ScrollFadeAxis,
  layoutKey?: string | number | boolean,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const sync = () => {
      syncScrollFade(element, axis);
    };

    sync();
    element.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);

    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(element);
    for (const child of element.children) {
      if (child instanceof HTMLElement) {
        resizeObserver.observe(child);
      }
    }

    const mutationObserver = new MutationObserver((mutations) => {
      sync();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            resizeObserver.observe(node);
          }
        }
      }
    });
    mutationObserver.observe(element, { childList: true, subtree: true });

    return () => {
      element.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref, axis, layoutKey]);
}

/**
 * Updates `data-fade-start` / `data-fade-end` on a horizontal scroller so
 * CSS masks can hint overflow without a visible scrollbar.
 */
export function useScrollFadeX(
  ref: RefObject<HTMLElement | null>,
  /** Re-run when tab/item counts change layout. */
  layoutKey?: string | number | boolean,
): void {
  useScrollFade(ref, 'x', layoutKey);
}

/**
 * Same as {@link useScrollFadeX} for vertical scrollers (`.scroll-fade-y`).
 * Optionally mirrors `data-fade-*` onto a host for overlay fades
 * (`.scroll-fade-y-host`); CSS masks are unreliable on overflow scrollers.
 */
export function useScrollFadeY(
  ref: RefObject<HTMLElement | null>,
  layoutKey?: string | number | boolean,
  hostRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const sync = () => {
      syncScrollFade(element, 'y');
      const host = hostRef?.current;
      if (host) {
        host.dataset.fadeStart = element.dataset.fadeStart ?? 'false';
        host.dataset.fadeEnd = element.dataset.fadeEnd ?? 'false';
      }
    };

    sync();
    element.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);

    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(element);
    for (const child of element.children) {
      if (child instanceof HTMLElement) {
        resizeObserver.observe(child);
      }
    }

    const mutationObserver = new MutationObserver((mutations) => {
      sync();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            resizeObserver.observe(node);
          }
        }
      }
    });
    mutationObserver.observe(element, { childList: true, subtree: true });

    return () => {
      element.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref, layoutKey, hostRef]);
}
