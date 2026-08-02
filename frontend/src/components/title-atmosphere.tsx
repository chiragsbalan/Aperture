'use client';

import Image from 'next/image';
import { useEffect, useState, type ReactNode } from 'react';

type TitleContrast = 'on-dark' | 'on-light';

const SAMPLE_SIZE = 48;
/** Perceived luminance above this → dark text on a light-feeling backdrop. */
const LIGHT_BACKDROP_THRESHOLD = 0.52;
/** Shared with poster mosaic pause control. */
const MOSAIC_FLIPS_PAUSED_KEY = 'aperture.mosaicFlipsPaused';

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Approximate the painted backdrop under the *dark* veil only, then average
 * luminance in the title text band so contrast matches what the user sees.
 *
 * CSS veil (globals.css) is the source of truth; this sampler is approximate
 * and dark-biased. Do not paint the on-light cream veil before deciding —
 * that veil applies only after contrast is chosen. Fail-safe: on-dark.
 */
function contrastFromImageElement(img: HTMLImageElement): TitleContrast {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return 'on-dark';
  }

  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (nw < 1 || nh < 1) {
    return 'on-dark';
  }

  // Title copy sits in the left/center content column — bias the crop there
  // (lower-weighted band) instead of averaging the full frame.
  const sx = nw * 0.05;
  const sy = nh * 0.22;
  const sw = nw * 0.52;
  const sh = nh * 0.55;

  ctx.fillStyle = '#0c0b09';
  ctx.fillRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  // Matches painted backdrop Image opacity.
  ctx.globalAlpha = 0.48;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  ctx.globalAlpha = 1;

  // Dark-veil approx: CSS on-dark peaks ~0.86 at the bottom; flat 0.58 under-darkens.
  ctx.fillStyle = 'rgba(12, 11, 9, 0.74)';
  ctx.fillRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const bottomWeight = ctx.createLinearGradient(0, 0, 0, SAMPLE_SIZE);
  bottomWeight.addColorStop(0, 'rgba(12, 11, 9, 0)');
  bottomWeight.addColorStop(0.42, 'rgba(12, 11, 9, 0.12)');
  bottomWeight.addColorStop(1, 'rgba(12, 11, 9, 0.28)');
  ctx.fillStyle = bottomWeight;
  ctx.fillRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  let total = 0;
  let weightSum = 0;
  for (let y = 0; y < SAMPLE_SIZE; y++) {
    // Extra weight on lower rows where overview text sits.
    const rowWeight = 0.65 + (y / (SAMPLE_SIZE - 1)) * 0.7;
    for (let x = 0; x < SAMPLE_SIZE; x++) {
      const i = (y * SAMPLE_SIZE + x) * 4;
      total +=
        relativeLuminance(data[i]!, data[i + 1]!, data[i + 2]!) * rowWeight;
      weightSum += rowWeight;
    }
  }
  const average = total / weightSum;
  return average >= LIGHT_BACKDROP_THRESHOLD ? 'on-light' : 'on-dark';
}

function sampleUrlForBackdrop(backdropUrl: string): string {
  // Same-origin Next optimizer URL so canvas sampling is not blocked by CDN CORS.
  const params = new URLSearchParams({
    url: backdropUrl,
    w: '640',
    q: '75',
  });
  return `/_next/image?${params.toString()}`;
}

/**
 * Fixed viewport backdrop + client-only text contrast from backdrop luminance.
 *
 * Sets ``data-title-contrast`` to ``on-dark`` | ``on-light`` so globals.css can
 * override fg/muted tokens locally — independent of the app ``data-theme``.
 * Drift pauses under prefers-reduced-motion or shared mosaic pause preference.
 */
export function TitleAtmosphere({
  backdropUrl,
  children,
}: {
  backdropUrl: string | null;
  children: ReactNode;
}) {
  const [contrast, setContrast] = useState<TitleContrast>('on-dark');
  const [driftPaused, setDriftPaused] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncDriftPause = () => {
      let userPaused = false;
      try {
        userPaused =
          window.localStorage.getItem(MOSAIC_FLIPS_PAUSED_KEY) === '1';
      } catch {
        // Ignore storage failures (private mode / blocked).
      }
      setDriftPaused(motion.matches || userPaused);
    };
    syncDriftPause();
    motion.addEventListener('change', syncDriftPause);
    window.addEventListener('storage', syncDriftPause);
    return () => {
      motion.removeEventListener('change', syncDriftPause);
      window.removeEventListener('storage', syncDriftPause);
    };
  }, []);

  useEffect(() => {
    if (!backdropUrl) {
      setContrast('on-dark');
      return;
    }

    let cancelled = false;
    const img = new window.Image();
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) {
        return;
      }
      try {
        setContrast(contrastFromImageElement(img));
      } catch {
        setContrast('on-dark');
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setContrast('on-dark');
      }
    };
    img.src = sampleUrlForBackdrop(backdropUrl);

    return () => {
      cancelled = true;
    };
  }, [backdropUrl]);

  return (
    <div
      data-title-contrast={contrast}
      // Re-bind ``color`` to the local token so inheritance does not keep the
      // app-theme computed color from ``body`` (light fg stays black otherwise).
      className="relative min-h-dvh text-foreground"
    >
      {backdropUrl ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 h-dvh w-screen overflow-hidden"
        >
          <Image
            src={backdropUrl}
            alt=""
            fill
            priority
            className="object-cover object-center opacity-[0.48]"
            sizes="100vw"
          />
          <div className="catalog-backdrop-veil absolute inset-0" />
          {driftPaused ? null : (
            <div className="catalog-backdrop-drift absolute -inset-[8%]" />
          )}
        </div>
      ) : null}
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
