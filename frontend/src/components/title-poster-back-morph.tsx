'use client';

import { useEffect } from 'react';

import {
  TITLE_POSTER_MORPH_MS,
  clearTitlePosterHeroSnapshot,
  consumeTitlePosterHeroSnapshot,
  findTitlePosterElement,
  peekTitlePosterHeroSnapshot,
  type TitlePosterHeroSnapshot,
} from '@/lib/title-poster-morph';

const BACK_MORPH_FIND_MAX_FRAMES = 16;

/**
 * Browser Back skips React View Transitions (sync history restore). This
 * listener FLIPs a poster clone from the detail hero rect back to the list
 * poster after popstate restores the previous page.
 */
export function TitlePosterBackMorph() {
  useEffect(() => {
    function prefersReducedMotion(): boolean {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function runFlip(
      snapshot: TitlePosterHeroSnapshot,
      target: HTMLElement,
    ): void {
      const to = target.getBoundingClientRect();
      if (to.width < 1 || to.height < 1) {
        return;
      }

      const from = snapshot.rect;
      const clone = document.createElement('div');
      clone.setAttribute('aria-hidden', 'true');
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

      if (snapshot.posterUrl) {
        const img = document.createElement('img');
        img.src = snapshot.posterUrl;
        img.alt = '';
        img.draggable = false;
        img.style.cssText =
          'width:100%;height:100%;object-fit:cover;object-position:top;display:block';
        clone.appendChild(img);
      } else {
        clone.style.background = 'var(--color-bg-elevated)';
      }

      const previousOpacity = target.style.opacity;
      target.style.opacity = '0';
      document.body.appendChild(clone);

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
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
          fill: 'forwards',
        },
      );

      const finish = () => {
        clone.remove();
        target.style.opacity = previousOpacity;
      };

      animation.finished.then(finish).catch(finish);
    }

    function runBackMorph(): void {
      if (prefersReducedMotion()) {
        clearTitlePosterHeroSnapshot();
        return;
      }

      const snapshot = peekTitlePosterHeroSnapshot();
      if (
        snapshot == null ||
        snapshot.rect.width < 1 ||
        snapshot.rect.height < 1
      ) {
        return;
      }

      let attempts = 0;
      const tryFind = (): void => {
        const target = findTitlePosterElement(snapshot.contentId);
        if (target != null) {
          const to = target.getBoundingClientRect();
          if (to.width >= 1 && to.height >= 1) {
            consumeTitlePosterHeroSnapshot();
            runFlip(snapshot, target);
            return;
          }
        }
        attempts += 1;
        if (attempts >= BACK_MORPH_FIND_MAX_FRAMES) {
          clearTitlePosterHeroSnapshot();
          return;
        }
        window.requestAnimationFrame(tryFind);
      };
      tryFind();
    }

    function onPopState(): void {
      // Next restores the previous route inside this same popstate turn.
      // Defer so the list poster exists before we FLIP to it.
      window.setTimeout(() => {
        runBackMorph();
      }, 40);
    }

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  return null;
}
