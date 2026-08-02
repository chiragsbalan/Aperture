'use client';

import Image from 'next/image';
import { useEffect, useState, type ReactNode } from 'react';

type TitleContrast = 'on-dark' | 'on-light';

const SAMPLE_SIZE = 48;
/** Perceived luminance above this → dark text on a light-feeling backdrop. */
const LIGHT_BACKDROP_THRESHOLD = 0.52;

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Approximate the painted backdrop (theme fill + 40% image + soft veil)
 * then average luminance so contrast matches what the user sees.
 */
function contrastFromImageElement(img: HTMLImageElement): TitleContrast {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return 'on-dark';
  }

  ctx.fillStyle = '#0c0b09';
  ctx.fillRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  ctx.globalAlpha = 0.4;
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(12, 11, 9, 0.48)';
  ctx.fillRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  let total = 0;
  const pixelCount = SAMPLE_SIZE * SAMPLE_SIZE;
  for (let i = 0; i < data.length; i += 4) {
    total += relativeLuminance(data[i], data[i + 1], data[i + 2]);
  }
  const average = total / pixelCount;
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
 */
export function TitleAtmosphere({
  backdropUrl,
  children,
}: {
  backdropUrl: string | null;
  children: ReactNode;
}) {
  const [contrast, setContrast] = useState<TitleContrast>('on-dark');

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
    <div data-title-contrast={contrast} className="relative min-h-dvh">
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
            className="object-cover object-center opacity-40"
            sizes="100vw"
          />
          <div className="catalog-backdrop-veil absolute inset-0" />
        </div>
      ) : null}
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
