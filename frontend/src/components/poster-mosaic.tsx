'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Soft circular lens around the cursor.
 * Inside the inner radius posters are near peak scale; between inner and outer
 * they ease down so a cluster (not a single tile) feels magnified.
 */
const LENS_INNER_PX = 96;
const LENS_OUTER_PX = 210;
/** Peak scale at the center of the lens. */
const MAX_SCALE = 1.35;
/** Lerp toward target scale each frame. */
const SMOOTHING = 0.22;
/** Matches `.poster-mosaic-layer` minmax widths in globals.css. */
const TILE_MIN_WIDTH_MOBILE = 52;
const TILE_MIN_WIDTH_DESKTOP = 60;
/** Hard cap — matches backend landing_posters_count upper bound. */
const MAX_TILES = 200;
/** SSR / first paint floor before we can measure the viewport. */
const INITIAL_TILE_COUNT = 120;
/** Binary z-index threshold so we avoid per-frame unique stacking churn. */
const Z_INDEX_SCALE_THRESHOLD = 1.05;

function lensEase(distance: number): number {
  if (distance <= LENS_INNER_PX) {
    return 1;
  }
  if (distance >= LENS_OUTER_PX) {
    return 0;
  }
  const t = 1 - (distance - LENS_INNER_PX) / (LENS_OUTER_PX - LENS_INNER_PX);
  // Smoothstep falloff on the ring between inner and outer radius.
  return t * t * (3 - 2 * t);
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic PRNG so SSR and the client's first paint match. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTiles(
  posters: readonly string[],
  count: number,
  seed: number,
): string[] {
  const rng = mulberry32(seed);
  const tiles: string[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(rng() * posters.length);
    tiles.push(posters[index]!);
  }
  return tiles;
}

function tileCountForViewport(width: number, height: number): number {
  const minWidth =
    width >= 768 ? TILE_MIN_WIDTH_DESKTOP : TILE_MIN_WIDTH_MOBILE;
  const cols = Math.max(1, Math.ceil(width / minWidth));
  const tileHeight = minWidth * 1.5;
  // Extra rows so short scroll / subpixel rounding never leaves a bare strip.
  const rows = Math.max(1, Math.ceil(height / tileHeight) + 4);
  return Math.min(MAX_TILES, cols * rows);
}

/**
 * Decorative low-opacity poster grid for landing / auth shells.
 * Sits above `.shell-atmosphere` so the amber gradient shows through.
 * A circular cluster of posters near the pointer gently magnifies.
 */
export function PosterMosaic({
  posters,
  opacity = 0.15,
}: {
  posters: readonly string[];
  /** 0–1; keep low so hero copy stays readable. */
  opacity?: number;
}) {
  const layerRef = useRef<HTMLUListElement>(null);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });
  const scalesRef = useRef<Float32Array | null>(null);
  /** Precomputed tile centers as [cx, cy, cx, cy, ...] in layer-local coords. */
  const centersRef = useRef<Float32Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const loopRunningRef = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [tileCount, setTileCount] = useState(INITIAL_TILE_COUNT);

  const seed = useMemo(
    () => hashSeed(posters.join('|') || 'aperture-mosaic'),
    [posters],
  );
  const tiles = useMemo(
    () =>
      posters.length === 0 ? [] : buildTiles(posters, tileCount, seed),
    [posters, tileCount, seed],
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setReduceMotion(media.matches);
    };
    sync();
    media.addEventListener('change', sync);
    return () => {
      media.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    if (posters.length === 0) {
      return;
    }

    const updateCount = () => {
      setTileCount(
        tileCountForViewport(window.innerWidth, window.innerHeight),
      );
    };
    updateCount();
    window.addEventListener('resize', updateCount);
    return () => {
      window.removeEventListener('resize', updateCount);
    };
  }, [posters.length]);

  useEffect(() => {
    if (posters.length === 0 || tiles.length === 0) {
      centersRef.current = null;
      return;
    }

    const recomputeCenters = () => {
      const layer = layerRef.current;
      if (!layer) {
        return;
      }
      const items = layer.children;
      const count = items.length;
      const centers = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        const item = items[i] as HTMLElement;
        centers[i * 2] = item.offsetLeft + item.offsetWidth / 2;
        centers[i * 2 + 1] = item.offsetTop + item.offsetHeight / 2;
      }
      centersRef.current = centers;
    };

    // Layout may not be final until after paint.
    recomputeCenters();
    const rafId = window.requestAnimationFrame(recomputeCenters);
    window.addEventListener('resize', recomputeCenters);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', recomputeCenters);
    };
  }, [posters.length, tiles.length]);

  useEffect(() => {
    if (reduceMotion || posters.length === 0) {
      return;
    }

    const stopLoop = () => {
      loopRunningRef.current = false;
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const tick = () => {
      if (document.hidden) {
        stopLoop();
        return;
      }

      const layer = layerRef.current;
      const centers = centersRef.current;
      if (!layer || !centers) {
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const items = layer.children;
      const count = items.length;
      if (!scalesRef.current || scalesRef.current.length !== count) {
        scalesRef.current = new Float32Array(count);
        scalesRef.current.fill(1);
      }

      const mouse = mouseRef.current;
      const layerRect = layer.getBoundingClientRect();
      const scales = scalesRef.current;
      let anyScaled = false;

      for (let i = 0; i < count; i++) {
        const item = items[i] as HTMLElement;
        let target = 1;
        if (mouse.active) {
          const cx = layerRect.left + centers[i * 2]!;
          const cy = layerRect.top + centers[i * 2 + 1]!;
          const distance = Math.hypot(mouse.x - cx, mouse.y - cy);
          const ease = lensEase(distance);
          target = 1 + (MAX_SCALE - 1) * ease;
        }

        const next = scales[i]! + (target - scales[i]!) * SMOOTHING;
        scales[i] = next;
        if (next <= 1.002) {
          item.style.transform = '';
          item.style.zIndex = '';
        } else {
          anyScaled = true;
          item.style.transform = `scale(${next.toFixed(4)})`;
          item.style.zIndex = next > Z_INDEX_SCALE_THRESHOLD ? '1' : '';
        }
      }

      if (!mouse.active && !anyScaled) {
        stopLoop();
        return;
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (loopRunningRef.current || document.hidden) {
        return;
      }
      loopRunningRef.current = true;
      rafRef.current = window.requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      mouseRef.current = {
        x: event.clientX,
        y: event.clientY,
        active: true,
      };
      startLoop();
    };

    const onLeave = () => {
      mouseRef.current = { ...mouseRef.current, active: false };
      // Keep the loop running so scales ease back to 1, then idle-stop.
      startLoop();
    };

    const onVisibility = () => {
      if (document.hidden) {
        stopLoop();
        return;
      }
      if (mouseRef.current.active) {
        startLoop();
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      stopLoop();
      const layer = layerRef.current;
      if (layer) {
        for (const child of Array.from(layer.children)) {
          const item = child as HTMLElement;
          item.style.transform = '';
          item.style.zIndex = '';
        }
      }
    };
  }, [posters.length, reduceMotion, tiles.length]);

  if (posters.length === 0) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ opacity }}
    >
      <ul ref={layerRef} className="poster-mosaic-layer">
        {tiles.map((url, index) => (
          <li key={`${index}-${url}`} className="poster-mosaic-tile relative">
            <Image
              src={url}
              alt=""
              fill
              sizes="72px"
              className="object-cover"
              loading="lazy"
              unoptimized
            />
          </li>
        ))}
      </ul>
      <div className="poster-mosaic-veil absolute inset-0" />
    </div>
  );
}
