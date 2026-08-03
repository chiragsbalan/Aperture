/**
 * @fileoverview Keep `.scroll-fade-x` edge masks in sync with scroll position.
 *
 * Pair with the `.scroll-fade-x` utility in `globals.css` (tokens:
 * `--scroll-fade-size` in `tokens.css`).
 */

import { type RefObject, useEffect } from 'react';

const SCROLL_EDGE_PX = 1;

function syncScrollFadeX(element: HTMLElement): void {
  const maxScroll = element.scrollWidth - element.clientWidth;
  const canScroll = maxScroll > SCROLL_EDGE_PX;
  const atStart = element.scrollLeft <= SCROLL_EDGE_PX;
  const atEnd = element.scrollLeft >= maxScroll - SCROLL_EDGE_PX;
  element.dataset.fadeStart = canScroll && !atStart ? 'true' : 'false';
  element.dataset.fadeEnd = canScroll && !atEnd ? 'true' : 'false';
}

/**
 * Updates `data-fade-start` / `data-fade-end` on a horizontal scroller so
 * CSS masks can hint overflow without a visible scrollbar.
 */
export function useScrollFadeX(
  ref: RefObject<HTMLElement | null>,
  /** Re-run when tab/item counts change layout. */
  layoutKey?: string | number,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const sync = () => {
      syncScrollFadeX(element);
    };

    sync();
    element.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);

    // Parent ResizeObserver covers most size changes; observe existing and
    // newly added children once so tab width changes still trigger sync.
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
    mutationObserver.observe(element, { childList: true });

    return () => {
      element.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref, layoutKey]);
}
