/**
 * @fileoverview List→hero poster FLIP for every title-poster navigation.
 *
 * React View Transitions are unreliable for same-route detail→detail
 * (e.g. Similar on a movie page). A fixed-position FLIP clone runs on click
 * for every surface so the morph is consistent from home, search, library,
 * and title detail alike. The loading / detail hero takes over when the
 * flight settles.
 */

import { TITLE_POSTER_MORPH_MS } from '@/lib/title-poster-morph';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ActiveFlight {
  clone: HTMLElement;
  source: HTMLElement | null;
  sourceOpacity: string;
  outgoingHero: HTMLElement | null;
  outgoingHeroOpacity: string;
  outgoingMain: HTMLElement | null;
  outgoingMainOpacity: string;
  outgoingMainTransition: string;
  animation: Animation;
  contentId: string | null;
  targetEl: HTMLElement | null;
  targetOpacity: string;
  /** True once a hold/settle target has called {@link bindTitlePosterFlightTarget}. */
  targetClaimed: boolean;
  settling: boolean;
  settlePromise: Promise<void> | null;
}

let activeFlight: ActiveFlight | null = null;

function viewportWidth(): number {
  // Prefer clientWidth so scrollbar-gutter: stable does not shift the column.
  return document.documentElement.clientWidth || window.innerWidth;
}

function removeOrphanFlightClones(): void {
  for (const node of document.querySelectorAll('[data-title-poster-flight]')) {
    node.remove();
  }
}

/**
 * Hero poster box for the destination page.
 *
 * On a title detail page (Similar → another title), measure the current hero
 * and correct for scroll so the flight lands where the next page’s hero will
 * sit after scroll resets to top.
 */
export function estimateDetailHeroRect(): Rect {
  const live = document.querySelector<HTMLElement>(
    'main article [data-title-poster], main [role="status"] [data-title-poster]',
  );
  if (live != null) {
    const rect = live.getBoundingClientRect();
    if (rect.width >= 1) {
      const height = rect.height >= 1 ? rect.height : rect.width * 1.5;
      return {
        // Navigation resets scroll to top; convert document Y → viewport Y@0.
        top: rect.top + window.scrollY,
        left: rect.left,
        width: rect.width,
        height,
      };
    }
  }

  const rootFs = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize || '16',
  );
  const sm = window.matchMedia('(min-width: 640px)').matches;
  const posterW = (sm ? 18 : 6.75) * rootFs;
  const posterH = posterW * 1.5;
  // Absolute header; content uses .layout-shell-pad-top and poster sm:mt-12.
  const top = (sm ? 7 : 6) * rootFs + (sm ? 3 : 0) * rootFs;

  // Prefer the real content column — geometric centering can be ~½ scrollbar
  // off from ``.layout-content`` even with clientWidth.
  const column = document.querySelector('.layout-content');
  if (column != null) {
    const box = column.getBoundingClientRect();
    const padRight =
      Number.parseFloat(getComputedStyle(column).paddingRight) || 0;
    if (box.width >= 1) {
      return {
        top,
        left: box.right - padRight - posterW,
        width: posterW,
        height: posterH,
      };
    }
  }

  const viewW = viewportWidth();
  const maxW = Math.min(viewW, 64 * rootFs);
  const padX = (sm ? 1.5 : 1) * rootFs;
  const contentLeft = Math.max(0, (viewW - maxW) / 2);
  const left = contentLeft + maxW - padX - posterW;
  return { top, left, width: posterW, height: posterH };
}

export function isTitlePosterFlightActive(contentId?: string): boolean {
  if (activeFlight == null) {
    return false;
  }
  if (contentId == null) {
    return true;
  }
  return activeFlight.contentId === contentId;
}

/** Movie/TV detail and cold TMDb loading shells — keep the flight alive here. */
export function isTitlePosterDestinationPath(pathname: string): boolean {
  return pathname.startsWith('/movies/') || pathname.startsWith('/tv/');
}

function bakeCloneTransform(clone: HTMLElement): Rect {
  const visual = clone.getBoundingClientRect();
  clone.style.top = `${visual.top}px`;
  clone.style.left = `${visual.left}px`;
  clone.style.width = `${visual.width}px`;
  clone.style.height = `${visual.height}px`;
  clone.style.transform = 'none';
  return {
    top: visual.top,
    left: visual.left,
    width: visual.width,
    height: visual.height,
  };
}

/**
 * FLIP the clicked poster toward the detail hero slot.
 *
 * Call this in the click handler before ``router.push`` so motion starts
 * even when React View Transitions skip same-route navigations.
 */
export function startTitlePosterFlight(options: {
  source: HTMLElement;
  posterUrl: string | null;
  contentId?: string | null;
  /** Pre-measured source box (use when scrolling before the flight). */
  from?: Rect;
  to?: Rect;
}): void {
  endTitlePosterFlight();
  removeOrphanFlightClones();

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  let from = options.from;
  if (from == null) {
    const measured = options.source.getBoundingClientRect();
    from = {
      top: measured.top,
      left: measured.left,
      width: measured.width,
      height: measured.height,
    };
  }
  if (from.width < 1 || from.height < 1) {
    return;
  }
  const to = options.to ?? estimateDetailHeroRect();

  const clone = document.createElement('div');
  clone.setAttribute('aria-hidden', 'true');
  clone.dataset.titlePosterFlight = 'true';
  clone.style.cssText = [
    'position:fixed',
    `top:${from.top}px`,
    `left:${from.left}px`,
    `width:${from.width}px`,
    `height:${from.height}px`,
    'margin:0',
    'padding:0',
    'border-radius:var(--radius-sm)',
    'overflow:hidden',
    'z-index:9999',
    'pointer-events:none',
    'box-shadow:var(--elev-poster)',
    'transform-origin:top left',
    'will-change:transform',
  ].join(';');

  if (options.posterUrl) {
    const img = document.createElement('img');
    img.src = options.posterUrl;
    img.alt = '';
    img.draggable = false;
    img.style.cssText =
      'width:100%;height:100%;object-fit:cover;object-position:top;display:block';
    clone.appendChild(img);
  } else {
    clone.style.background = 'var(--color-bg-elevated)';
  }

  const sourceOpacity = options.source.style.opacity;
  options.source.style.opacity = '0';

  // Detail→detail: hide the current hero so two posters are not visible.
  const outgoingCandidate = document.querySelector<HTMLElement>(
    'main article [data-title-poster]',
  );
  const hideOutgoing =
    outgoingCandidate != null &&
    outgoingCandidate !== options.source &&
    !options.source.contains(outgoingCandidate);
  const outgoingHero = hideOutgoing ? outgoingCandidate : null;
  const outgoingHeroOpacity = outgoingHero?.style.opacity ?? '';
  if (outgoingHero != null) {
    outgoingHero.style.opacity = '0';
  }

  document.body.appendChild(clone);

  // Fade the outgoing page under the clone so the route change reads as
  // starting with the morph (not after the poster lands). Only the current
  // ``main`` is touched — the destination loading/detail shell must stay
  // visible as soon as it mounts.
  const outgoingMain = document.querySelector('main');
  const outgoingMainOpacity = outgoingMain?.style.opacity ?? '';
  const outgoingMainTransition = outgoingMain?.style.transition ?? '';
  if (outgoingMain != null) {
    const fadeMs = Math.round(TITLE_POSTER_MORPH_MS * 0.55);
    outgoingMain.style.transition = `opacity ${fadeMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    outgoingMain.style.pointerEvents = 'none';
    // Force a style flush so the opacity transition runs from 1 → 0.
    void outgoingMain.offsetWidth;
    outgoingMain.style.opacity = '0';
  }

  const deltaX = to.left - from.left;
  const deltaY = to.top - from.top;
  const scaleX = to.width / from.width;
  const scaleY = to.height / from.height;

  const animation = clone.animate(
    [
      { transform: 'translate(0px, 0px) scale(1, 1)' },
      {
        transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
      },
    ],
    {
      duration: TITLE_POSTER_MORPH_MS,
      easing: 'cubic-bezier(0.22, 0.82, 0.2, 1)',
      fill: 'forwards',
    },
  );

  activeFlight = {
    clone,
    source: options.source,
    sourceOpacity,
    outgoingHero,
    outgoingHeroOpacity,
    outgoingMain,
    outgoingMainOpacity,
    outgoingMainTransition,
    animation,
    contentId: options.contentId ?? null,
    targetEl: null,
    targetOpacity: '',
    targetClaimed: false,
    settling: false,
    settlePromise: null,
  };
}

/**
 * Hide the real hero while the FLIP clone covers it.
 *
 * Does not interrupt the in-flight animation — a mid-air retarget reads as
 * jitter. Alignment is corrected once in {@link settleTitlePosterFlight}.
 */
export function bindTitlePosterFlightTarget(target: HTMLElement): void {
  const flight = activeFlight;
  if (flight == null) {
    return;
  }

  flight.targetClaimed = true;

  if (flight.targetEl != null && flight.targetEl !== target) {
    if (flight.targetEl.isConnected) {
      flight.targetEl.style.opacity = flight.targetOpacity;
    }
  }

  if (flight.targetEl !== target) {
    flight.targetOpacity = target.style.opacity;
    flight.targetEl = target;
  }
  target.style.opacity = '0';
}

/**
 * Hold shell unmounted — wait a couple frames for the detail settle target to
 * claim before tearing down. Immediate end would kill the happy-path handoff
 * (hold cleanup runs before the settle effect binds).
 */
export function scheduleTitlePosterFlightOrphanCheck(): void {
  const flight = activeFlight;
  if (flight == null || flight.targetClaimed) {
    return;
  }

  let frames = 0;
  const check = (): void => {
    frames += 1;
    if (activeFlight !== flight) {
      return;
    }
    if (flight.targetClaimed) {
      return;
    }
    if (frames < 2) {
      window.requestAnimationFrame(check);
      return;
    }
    // Still unclaimed after 2 rAF — loading→detail handoff did not claim.
    endTitlePosterFlight();
  };
  window.requestAnimationFrame(check);
}

function waitForTargetImage(target: HTMLElement): Promise<void> {
  const img = target.querySelector('img');
  if (img == null) {
    return Promise.resolve();
  }

  const ready = (): Promise<void> => {
    if (typeof img.decode === 'function') {
      return img.decode().then(
        () => undefined,
        () => undefined,
      );
    }
    return Promise.resolve();
  };

  if (img.complete && img.naturalWidth > 0) {
    return ready();
  }

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      window.clearTimeout(timeout);
      void ready().then(resolve);
    };
    const timeout = window.setTimeout(finish, 1200);
    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
  });
}

/**
 * Wait for the FLIP to finish, pixel-align to the bound hero, then reveal it.
 *
 * When ``waitForImage`` is set, keep the clone covering the slot until the
 * destination ``<img>`` has decoded — avoids a blank/flicker when loading
 * shell → detail remounts the Next/Image hero.
 */
export function settleTitlePosterFlight(options?: {
  waitForImage?: boolean;
}): Promise<void> {
  const flight = activeFlight;
  if (flight == null) {
    removeOrphanFlightClones();
    return Promise.resolve();
  }
  if (flight.settlePromise != null) {
    return flight.settlePromise;
  }

  flight.settling = true;
  flight.settlePromise = new Promise<void>((resolve) => {
    let finished = false;
    const finish = (): void => {
      if (finished || activeFlight !== flight) {
        resolve();
        return;
      }
      finished = true;
      const reveal = (): void => {
        if (activeFlight !== flight) {
          resolve();
          return;
        }
        // Drop the WAAPI effect *before* writing final box styles. Baking
        // width/height while fill:forwards still applies scale double-transforms
        // the clone for a frame (reads as the poster flying around).
        commitAndStopAnimation(flight.animation, flight.clone);

        if (flight.targetEl != null && flight.targetEl.isConnected) {
          const to = flight.targetEl.getBoundingClientRect();
          if (to.width >= 1 && to.height >= 1) {
            flight.clone.style.top = `${to.top}px`;
            flight.clone.style.left = `${to.left}px`;
            flight.clone.style.width = `${to.width}px`;
            flight.clone.style.height = `${to.height}px`;
            flight.clone.style.transform = 'none';
          }
        }
        // One paint with the real hero under the clone, then lift the clone.
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (activeFlight === flight) {
              endTitlePosterFlight();
            }
            resolve();
          });
        });
      };

      if (options?.waitForImage && flight.targetEl != null) {
        void waitForTargetImage(flight.targetEl).then(reveal);
        return;
      }
      reveal();
    };

    // Soft navigations can leave Animation.finished pending; always tear down.
    const timeout = window.setTimeout(finish, TITLE_POSTER_MORPH_MS + 64);
    void flight.animation.finished
      .catch(() => {
        // Cancelled by a newer flight.
      })
      .then(() => {
        window.clearTimeout(timeout);
        finish();
      });
  });

  return flight.settlePromise;
}

function commitAndStopAnimation(
  animation: Animation,
  clone: HTMLElement,
): void {
  try {
    animation.commitStyles();
  } catch {
    // Older engines / already finished.
    bakeCloneTransform(clone);
  }
  try {
    animation.cancel();
  } catch {
    // Already finished.
  }
  clone.style.transform = 'none';
}

/** Remove an in-flight clone immediately. */
export function endTitlePosterFlight(): void {
  if (activeFlight == null) {
    removeOrphanFlightClones();
    return;
  }
  const {
    clone,
    source,
    sourceOpacity,
    outgoingHero,
    outgoingHeroOpacity,
    outgoingMain,
    outgoingMainOpacity,
    outgoingMainTransition,
    animation,
    targetEl,
    targetOpacity,
  } = activeFlight;
  activeFlight = null;
  // Prefer remove without cancel-first: cancel can flash the pre-FLIP box.
  clone.remove();
  try {
    animation.cancel();
  } catch {
    // Already finished.
  }
  if (source != null && source.isConnected) {
    source.style.opacity = sourceOpacity;
  }
  if (outgoingHero != null && outgoingHero.isConnected) {
    outgoingHero.style.opacity = outgoingHeroOpacity;
  }
  if (outgoingMain != null && outgoingMain.isConnected) {
    outgoingMain.style.opacity = outgoingMainOpacity;
    outgoingMain.style.transition = outgoingMainTransition;
    outgoingMain.style.pointerEvents = '';
  }
  if (targetEl != null && targetEl.isConnected) {
    targetEl.style.opacity = targetOpacity;
  }
  removeOrphanFlightClones();
}
