/**
 * @fileoverview Keep `.scroll-fade-x` / `.scroll-fade-y` edge fades in sync
 * with scroll position.
 *
 * Pair with the utilities in `globals.css`. Strength tokens in `tokens.css`:
 * `--scroll-fade-size` (horizontal fallback unused for tablists),
 * `--scroll-fade-size-y` (vertical = half a people row via
 * `--scroll-fade-people-row`). Scrollbars stay hidden; fades appear on edges
 * that still have overflow in that direction.
 *
 * Horizontal tablists mark the edge-most visible label with
 * `data-scroll-fade-edge` so a colourless fade spans that full name
 * (opaque on the inner side → transparent at the outer end). Vertical sheets
 * use charcoal overlays on `.scroll-fade-y-host`.
 */

import { type RefObject, useEffect } from 'react';

const SCROLL_EDGE_PX = 1;

type ScrollFadeAxis = 'x' | 'y';

/** Tab/link items that define edge-label fade; skip chrome. */
function isHorizontalFadeItem(node: Element): node is HTMLElement {
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  if (node.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  if (node.classList.contains('sr-only')) {
    return false;
  }
  if (node.classList.contains('title-tab-indicator')) {
    return false;
  }
  return true;
}

function clearHorizontalEdgeMarks(scroller: HTMLElement): void {
  for (const child of scroller.children) {
    if (child instanceof HTMLElement) {
      delete child.dataset.scrollFadeEdge;
    }
  }
}

/** Edge-most visible tab in the scroll viewport (start = leftmost, end = rightmost). */
function edgeVisibleItem(
  scroller: HTMLElement,
  edge: 'start' | 'end',
): HTMLElement | null {
  const viewLeft = scroller.scrollLeft;
  const viewRight = viewLeft + scroller.clientWidth;
  const items = [...scroller.children].filter(isHorizontalFadeItem);
  let edgeItem: HTMLElement | null = null;
  for (const item of items) {
    const left = item.offsetLeft;
    const right = left + item.offsetWidth;
    const visible =
      right > viewLeft + SCROLL_EDGE_PX && left < viewRight - SCROLL_EDGE_PX;
    if (!visible) {
      continue;
    }
    if (edgeItem == null) {
      edgeItem = item;
      continue;
    }
    if (edge === 'end' && left >= edgeItem.offsetLeft) {
      edgeItem = item;
    } else if (edge === 'start' && left < edgeItem.offsetLeft) {
      edgeItem = item;
    }
  }
  return edgeItem;
}

function syncScrollFade(element: HTMLElement, axis: ScrollFadeAxis): void {
  if (axis === 'x') {
    const maxScroll = element.scrollWidth - element.clientWidth;
    const canScroll = maxScroll > SCROLL_EDGE_PX;
    const atStart = element.scrollLeft <= SCROLL_EDGE_PX;
    const atEnd = element.scrollLeft >= maxScroll - SCROLL_EDGE_PX;
    const fadeStart = canScroll && !atStart;
    const fadeEnd = canScroll && !atEnd;
    element.dataset.fadeStart = fadeStart ? 'true' : 'false';
    element.dataset.fadeEnd = fadeEnd ? 'true' : 'false';

    clearHorizontalEdgeMarks(element);
    if (fadeStart) {
      const startItem = edgeVisibleItem(element, 'start');
      if (startItem) {
        startItem.dataset.scrollFadeEdge = 'start';
      }
    }
    if (fadeEnd) {
      const endItem = edgeVisibleItem(element, 'end');
      if (endItem) {
        endItem.dataset.scrollFadeEdge = 'end';
      }
    }
    return;
  }

  const maxScroll = element.scrollHeight - element.clientHeight;
  const canScroll = maxScroll > SCROLL_EDGE_PX;
  const atStart = element.scrollTop <= SCROLL_EDGE_PX;
  const atEnd = element.scrollTop >= maxScroll - SCROLL_EDGE_PX;
  element.dataset.fadeStart = canScroll && !atStart ? 'true' : 'false';
  element.dataset.fadeEnd = canScroll && !atEnd ? 'true' : 'false';
}

function mirrorFadeToHost(
  element: HTMLElement,
  host: HTMLElement | null | undefined,
  axis: ScrollFadeAxis,
): void {
  if (!host) {
    return;
  }
  host.dataset.fadeStart = element.dataset.fadeStart ?? 'false';
  host.dataset.fadeEnd = element.dataset.fadeEnd ?? 'false';
  // Horizontal fade is on the edge tab itself; host only needs fade flags
  // for layout chrome. Vertical host uses charcoal ::before/::after.
  void axis;
}

function useScrollFade(
  ref: RefObject<HTMLElement | null>,
  axis: ScrollFadeAxis,
  layoutKey?: string | number | boolean,
  hostRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const sync = () => {
      syncScrollFade(element, axis);
      mirrorFadeToHost(element, hostRef?.current, axis);
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
      if (axis === 'x') {
        clearHorizontalEdgeMarks(element);
      }
    };
  }, [ref, axis, layoutKey, hostRef]);
}

/**
 * Updates `data-fade-start` / `data-fade-end` and marks the edge-most visible
 * tabs with `data-scroll-fade-edge` so the full label fades outerward.
 * Pass `hostRef` for `.scroll-fade-x-host` (fade flags mirrored).
 */
export function useScrollFadeX(
  ref: RefObject<HTMLElement | null>,
  /** Re-run when tab/item counts change layout. */
  layoutKey?: string | number | boolean,
  hostRef?: RefObject<HTMLElement | null>,
): void {
  useScrollFade(ref, 'x', layoutKey, hostRef);
}

/**
 * Same as {@link useScrollFadeX} for vertical scrollers (`.scroll-fade-y`).
 * Pass `hostRef` for `.scroll-fade-y-host` overlay fades.
 */
export function useScrollFadeY(
  ref: RefObject<HTMLElement | null>,
  layoutKey?: string | number | boolean,
  hostRef?: RefObject<HTMLElement | null>,
): void {
  useScrollFade(ref, 'y', layoutKey, hostRef);
}
