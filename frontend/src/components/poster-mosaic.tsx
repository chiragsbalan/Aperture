'use client';

import Image from 'next/image';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
const TILE_GAP_PX = 1;
/**
 * Absurdly high guard only — stops a broken ResizeObserver / NaN size from
 * creating unbounded DOM. Normal viewports use exact cols × rows (posters
 * are reused randomly from the ~200 URL set; there is no product tile cap).
 */
const SAFETY_MAX_TILES = 3000;
/** SSR / first paint floor before we can measure the container. */
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

function columnCountForWidth(width: number): number {
  const minWidth =
    width >= 768 ? TILE_MIN_WIDTH_DESKTOP : TILE_MIN_WIDTH_MOBILE;
  // Match CSS auto-fill: floor((width + gap) / (minWidth + gap)).
  return Math.max(
    1,
    Math.floor((width + TILE_GAP_PX) / (minWidth + TILE_GAP_PX)),
  );
}

function tileCountForSize(width: number, height: number): number {
  const cols = columnCountForWidth(width);
  const tileWidth = (width - TILE_GAP_PX * (cols - 1)) / cols;
  const tileHeight = tileWidth * (3 / 2);
  // Extra rows cover subpixel rounding and short toolbars / URL chrome.
  const rows = Math.max(
    1,
    Math.ceil((height + TILE_GAP_PX) / (tileHeight + TILE_GAP_PX)) + 2,
  );
  // Exact cols × rows so the last row is never half-empty.
  return Math.min(SAFETY_MAX_TILES, cols * rows);
}

/** After paint: ensure real CSS columns × coverage, not just the estimate. */
function tileCountFromLaidOutGrid(
  layer: HTMLElement,
  containerHeight: number,
): number | null {
  const cols = getComputedStyle(layer)
    .gridTemplateColumns.split(/\s+/)
    .filter(Boolean).length;
  if (cols < 1 || layer.children.length === 0) {
    return null;
  }
  const sample = layer.children[0] as HTMLElement;
  const tileHeight = sample.offsetHeight || 1;
  const rows = Math.max(
    1,
    Math.ceil((containerHeight + TILE_GAP_PX) / (tileHeight + TILE_GAP_PX)) + 2,
  );
  return Math.min(SAFETY_MAX_TILES, cols * rows);
}

function isSearchOverlayOpen(): boolean {
  return document.body.hasAttribute('data-search-open');
}

function recomputeTileCenters(
  layer: HTMLUListElement | null,
  centersRef: { current: Float32Array | null },
) {
  if (!layer) {
    centersRef.current = null;
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
  const rootRef = useRef<HTMLDivElement>(null);
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
  const seedRef = useRef(seed);

  const [tiles, setTiles] = useState<string[]>(() =>
    posters.length === 0 ? [] : buildTiles(posters, INITIAL_TILE_COUNT, seed),
  );

  // Append-only on grow / truncate on shrink; full rebuild when seed changes.
  useEffect(() => {
    if (posters.length === 0) {
      seedRef.current = seed;
      setTiles([]);
      return;
    }

    setTiles((prev) => {
      const seedChanged = seedRef.current !== seed;
      seedRef.current = seed;

      if (seedChanged || prev.length === 0) {
        return buildTiles(posters, tileCount, seed);
      }
      if (tileCount > prev.length) {
        const full = buildTiles(posters, tileCount, seed);
        return prev.concat(full.slice(prev.length));
      }
      if (tileCount < prev.length) {
        return prev.slice(0, tileCount);
      }
      return prev;
    });
  }, [posters, seed, tileCount]);

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

  useLayoutEffect(() => {
    if (posters.length === 0) {
      return;
    }
    const root = rootRef.current;

    const syncFromContainer = () => {
      if (!root) {
        return;
      }
      const { width, height } = root.getBoundingClientRect();
      if (width < 1 || height < 1) {
        return;
      }
      const estimated = tileCountForSize(width, height);
      setTileCount((current) =>
        estimated === current ? current : estimated,
      );
      recomputeTileCenters(layerRef.current, centersRef);
    };

    if (!root || typeof ResizeObserver === 'undefined') {
      const syncFromWindow = () => {
        setTileCount(
          tileCountForSize(window.innerWidth, window.innerHeight),
        );
        recomputeTileCenters(layerRef.current, centersRef);
      };
      syncFromWindow();
      window.addEventListener('resize', syncFromWindow);
      return () => {
        window.removeEventListener('resize', syncFromWindow);
      };
    }

    syncFromContainer();
    const observer = new ResizeObserver(syncFromContainer);
    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, [posters.length]);

  // Second pass: if CSS columns differ from the estimate, top up to a full cover.
  useLayoutEffect(() => {
    if (posters.length === 0) {
      return;
    }
    const root = rootRef.current;
    const layer = layerRef.current;
    if (!root || !layer) {
      return;
    }
    const { height } = root.getBoundingClientRect();
    const needed = tileCountFromLaidOutGrid(layer, height);
    if (needed == null || needed <= tileCount) {
      return;
    }
    setTileCount(needed);
  }, [posters.length, tileCount, tiles.length]);

  useEffect(() => {
    if (posters.length === 0 || tiles.length === 0) {
      centersRef.current = null;
      return;
    }

    // Layout may not be final until after paint.
    recomputeTileCenters(layerRef.current, centersRef);
    const rafId = window.requestAnimationFrame(() => {
      recomputeTileCenters(layerRef.current, centersRef);
    });
    return () => {
      window.cancelAnimationFrame(rafId);
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
      if (document.hidden || isSearchOverlayOpen()) {
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
      if (
        loopRunningRef.current ||
        document.hidden ||
        isSearchOverlayOpen()
      ) {
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
      if (!isSearchOverlayOpen()) {
        startLoop();
      }
    };

    const onLeave = () => {
      mouseRef.current = { ...mouseRef.current, active: false };
      // Keep the loop running so scales ease back to 1, then idle-stop.
      if (!isSearchOverlayOpen()) {
        startLoop();
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stopLoop();
        return;
      }
      if (mouseRef.current.active && !isSearchOverlayOpen()) {
        startLoop();
      }
    };

    const onSearchOpenAttr = () => {
      if (isSearchOverlayOpen()) {
        stopLoop();
        return;
      }
      if (mouseRef.current.active) {
        startLoop();
      }
    };

    const searchOpenObserver = new MutationObserver(onSearchOpenAttr);
    searchOpenObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-search-open'],
    });

    const layerForCleanup = layerRef.current;

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      searchOpenObserver.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      stopLoop();
      if (layerForCleanup) {
        for (const child of Array.from(layerForCleanup.children)) {
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
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ opacity }}
    >
      <ul ref={layerRef} className="poster-mosaic-layer">
        {tiles.map((url, index) => (
          <li key={index} className="poster-mosaic-tile relative">
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
