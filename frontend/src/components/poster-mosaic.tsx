'use client';

import Image from 'next/image';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  appendTiles,
  buildTiles,
  needsFullTileRebuild,
  pickReplacementPoster,
} from '@/lib/poster-mosaic-tiles';

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
/**
 * Continuous staggered flips: start a new tile every STAGGER_* ms, capped so
 * several cards turn at once without flooding the grid.
 * Keep FLIP_ANIM_MS in sync with --poster-flip-ms in tokens.css.
 */
const FLIP_ANIM_MS = 640;
const FLIP_STAGGER_DENSE_MIN_MS = 70;
const FLIP_STAGGER_DENSE_MAX_MS = 150;
const FLIP_CONCURRENT_DENSE_MIN = 6;
const FLIP_CONCURRENT_DENSE_MAX = 14;
/** Coarse pointer or narrow viewports: lighter flip load. */
const FLIP_STAGGER_SPARSE_MIN_MS = 180;
const FLIP_STAGGER_SPARSE_MAX_MS = 360;
const FLIP_CONCURRENT_SPARSE_MIN = 2;
const FLIP_CONCURRENT_SPARSE_MAX = 4;
/** Attempts to find a free tile index that isn't already flipping. */
const FLIP_PICK_ATTEMPTS = 28;
const MOSAIC_FLIPS_PAUSED_KEY = 'aperture.mosaicFlipsPaused';

type FlipProfile = 'dense' | 'sparse';

interface PendingFlip {
  index: number;
  url: string;
  /** +1 = rotateY(180), -1 = rotateY(-180). */
  direction: 1 | -1;
}

interface PosterMosaicTileProps {
  url: string;
  flip: PendingFlip | null;
}

const PosterMosaicTile = memo(function PosterMosaicTile({
  url,
  flip,
}: PosterMosaicTileProps) {
  return (
    <li className="poster-mosaic-tile relative">
      <div
        className={`poster-mosaic-tile-inner${
          flip ? ' is-flipping' : ''
        }${flip?.direction === -1 ? ' is-flipping-reverse' : ''}`}
      >
        <div className="poster-mosaic-tile-face poster-mosaic-tile-face-front">
          <Image
            src={url}
            alt=""
            fill
            sizes="72px"
            className="object-cover"
            loading="lazy"
            unoptimized
          />
        </div>
        {flip ? (
          <div className="poster-mosaic-tile-face poster-mosaic-tile-face-back">
            <Image
              src={flip.url}
              alt=""
              fill
              sizes="72px"
              className="object-cover"
              loading="eager"
              unoptimized
            />
          </div>
        ) : null}
      </div>
    </li>
  );
});

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
): { cols: number; count: number } | null {
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
  return {
    cols,
    count: Math.min(SAFETY_MAX_TILES, cols * rows),
  };
}

function isSearchOverlayOpen(): boolean {
  return document.body.hasAttribute('data-search-open');
}

function columnCountFromLayer(
  layer: HTMLUListElement,
  fallback: number,
): number {
  const fromStyle = getComputedStyle(layer)
    .gridTemplateColumns.split(/\s+/)
    .filter(Boolean).length;
  return fromStyle > 0 ? fromStyle : Math.max(1, fallback);
}

/**
 * Lens hit-testing centers in layer-local coordinates.
 * Derived from the live CSS grid (not offsetTop/Height) so absolute flip
 * faces / transforms cannot collapse measurements to the top rows only.
 */
function recomputeTileCenters(
  layer: HTMLUListElement | null,
  colsFallback: number,
  centersRef: { current: Float32Array | null },
) {
  if (!layer) {
    centersRef.current = null;
    return;
  }
  const cols = columnCountFromLayer(layer, colsFallback);
  const count = layer.children.length;
  const width = layer.clientWidth;
  if (count < 1 || width < 1 || cols < 1) {
    centersRef.current = null;
    return;
  }
  const tileWidth = (width - TILE_GAP_PX * (cols - 1)) / cols;
  if (tileWidth < 1) {
    centersRef.current = null;
    return;
  }
  const tileHeight = tileWidth * (3 / 2);
  const strideX = tileWidth + TILE_GAP_PX;
  const strideY = tileHeight + TILE_GAP_PX;
  const centers = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    centers[i * 2] = col * strideX + tileWidth / 2;
    centers[i * 2 + 1] = row * strideY + tileHeight / 2;
  }
  centersRef.current = centers;
}

function nextFlipStaggerMs(profile: FlipProfile): number {
  if (profile === 'sparse') {
    return (
      FLIP_STAGGER_SPARSE_MIN_MS +
      Math.random() * (FLIP_STAGGER_SPARSE_MAX_MS - FLIP_STAGGER_SPARSE_MIN_MS)
    );
  }
  return (
    FLIP_STAGGER_DENSE_MIN_MS +
    Math.random() * (FLIP_STAGGER_DENSE_MAX_MS - FLIP_STAGGER_DENSE_MIN_MS)
  );
}

function maxConcurrentFlips(tileCount: number, profile: FlipProfile): number {
  if (profile === 'sparse') {
    return Math.min(
      FLIP_CONCURRENT_SPARSE_MAX,
      Math.max(FLIP_CONCURRENT_SPARSE_MIN, Math.round(tileCount / 80)),
    );
  }
  return Math.min(
    FLIP_CONCURRENT_DENSE_MAX,
    Math.max(FLIP_CONCURRENT_DENSE_MIN, Math.round(tileCount / 55)),
  );
}

/**
 * Decorative low-opacity poster grid for landing / auth shells.
 * Sits above `.shell-atmosphere` so the brand glow shows through.
 * A circular cluster of posters near the pointer gently magnifies.
 * Tiles occasionally swap to another poster, avoiding nearby duplicates.
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
  const colsRef = useRef(1);
  /** Stagger / schedule timeouts — kept across tile rebuilds. */
  const flipScheduleTimersRef = useRef<Set<number>>(new Set());
  /** Per-index commit timeouts — cancelled on full tile rebuild. */
  const flipCommitTimersRef = useRef<Map<number, number>>(new Map());
  const flippingIndicesRef = useRef<Set<number>>(new Set());
  const [reduceMotion, setReduceMotion] = useState(false);
  /** Pointer lens needs a fine pointer with hover — skip on touch / coarse UIs. */
  const [lensEnabled, setLensEnabled] = useState(false);
  const [flipProfile, setFlipProfile] = useState<FlipProfile>('dense');
  /** Default false for SSR/first paint; hydrated from localStorage after mount. */
  const [userPaused, setUserPaused] = useState(false);
  const [tileCount, setTileCount] = useState(INITIAL_TILE_COUNT);
  const [cols, setCols] = useState(1);
  const [pendingFlips, setPendingFlips] = useState<PendingFlip[]>([]);

  const pendingFlipByIndex = useMemo(() => {
    const map = new Map<number, PendingFlip>();
    for (const flip of pendingFlips) {
      map.set(flip.index, flip);
    }
    return map;
  }, [pendingFlips]);

  const seed = useMemo(
    () => hashSeed(posters.join('|') || 'aperture-mosaic'),
    [posters],
  );
  const colsForBuild = Math.max(1, cols);

  const [tiles, setTiles] = useState<string[]>(() =>
    posters.length === 0
      ? []
      : buildTiles(posters, INITIAL_TILE_COUNT, 1, seed),
  );

  const tilesRef = useRef(tiles);
  const seedRef = useRef(seed);
  const colsBuildRef = useRef(colsForBuild);

  // Append / slice / full rebuild when cols, seed, or count changes.
  useEffect(() => {
    const cancelFlipCommitTimers = () => {
      for (const id of flipCommitTimersRef.current.values()) {
        window.clearTimeout(id);
      }
      flipCommitTimersRef.current.clear();
    };

    if (posters.length === 0) {
      seedRef.current = seed;
      colsBuildRef.current = colsForBuild;
      cancelFlipCommitTimers();
      flippingIndicesRef.current.clear();
      setPendingFlips([]);
      setTiles([]);
      return;
    }

    const rebuild = needsFullTileRebuild({
      prevLength: tilesRef.current.length,
      prevCols: colsBuildRef.current,
      nextCols: colsForBuild,
      seedChanged: seedRef.current !== seed,
    });

    seedRef.current = seed;
    colsBuildRef.current = colsForBuild;

    if (rebuild) {
      cancelFlipCommitTimers();
      flippingIndicesRef.current.clear();
      setPendingFlips([]);
      setTiles(buildTiles(posters, tileCount, colsForBuild, seed));
      return;
    }

    setTiles((prev) => {
      if (tileCount > prev.length) {
        return appendTiles(prev, posters, tileCount, colsForBuild, seed);
      }
      if (tileCount < prev.length) {
        return prev.slice(0, tileCount);
      }
      return prev;
    });
  }, [posters, seed, tileCount, colsForBuild]);

  useEffect(() => {
    colsRef.current = colsForBuild;
  }, [colsForBuild]);

  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const lens = window.matchMedia('(hover: hover) and (pointer: fine)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const narrow = window.matchMedia('(max-width: 767px)');
    const syncMotion = () => {
      setReduceMotion(motion.matches);
    };
    const syncLens = () => {
      setLensEnabled(lens.matches);
    };
    const syncFlipProfile = () => {
      setFlipProfile(coarse.matches || narrow.matches ? 'sparse' : 'dense');
    };
    syncMotion();
    syncLens();
    syncFlipProfile();
    motion.addEventListener('change', syncMotion);
    lens.addEventListener('change', syncLens);
    coarse.addEventListener('change', syncFlipProfile);
    narrow.addEventListener('change', syncFlipProfile);
    return () => {
      motion.removeEventListener('change', syncMotion);
      lens.removeEventListener('change', syncLens);
      coarse.removeEventListener('change', syncFlipProfile);
      narrow.removeEventListener('change', syncFlipProfile);
    };
  }, []);

  // Hydrate pause preference after mount to avoid SSR/client mismatch.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(MOSAIC_FLIPS_PAUSED_KEY) === '1') {
        setUserPaused(true);
      }
    } catch {
      // Ignore storage failures (private mode / blocked).
    }
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
      const nextCols = columnCountForWidth(width);
      const estimated = tileCountForSize(width, height);
      setCols((current) => (nextCols === current ? current : nextCols));
      setTileCount((current) => (estimated === current ? current : estimated));
      recomputeTileCenters(layerRef.current, nextCols, centersRef);
    };

    if (!root || typeof ResizeObserver === 'undefined') {
      const syncFromWindow = () => {
        const nextCols = columnCountForWidth(window.innerWidth);
        setCols(nextCols);
        setTileCount(tileCountForSize(window.innerWidth, window.innerHeight));
        recomputeTileCenters(layerRef.current, nextCols, centersRef);
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
    const laidOut = tileCountFromLaidOutGrid(layer, height);
    if (laidOut == null) {
      return;
    }
    if (laidOut.cols !== cols) {
      setCols(laidOut.cols);
    }
    if (laidOut.count > tileCount) {
      setTileCount(laidOut.count);
    }
  }, [posters.length, tileCount, tiles.length, cols]);

  useEffect(() => {
    if (posters.length === 0 || tiles.length === 0) {
      centersRef.current = null;
      return;
    }

    // Layout may not be final until after paint.
    recomputeTileCenters(layerRef.current, colsRef.current, centersRef);
    const rafId = window.requestAnimationFrame(() => {
      recomputeTileCenters(layerRef.current, colsRef.current, centersRef);
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [posters.length, tiles.length, cols]);

  // Staggered multi-tile poster flips (paused when hidden / search / reduced motion / user).
  useEffect(() => {
    const flippingIndices = flippingIndicesRef.current;
    // Drop any mid-flip UI from a prior effect instance before scheduling.
    setPendingFlips([]);
    flippingIndices.clear();

    if (reduceMotion || userPaused || posters.length < 2) {
      return;
    }

    const trackScheduleTimeout = (fn: () => void, delayMs: number): number => {
      const id = window.setTimeout(() => {
        flipScheduleTimersRef.current.delete(id);
        fn();
      }, delayMs);
      flipScheduleTimersRef.current.add(id);
      return id;
    };

    const trackCommitTimeout = (
      index: number,
      fn: () => void,
      delayMs: number,
    ): number => {
      const existing = flipCommitTimersRef.current.get(index);
      if (existing != null) {
        window.clearTimeout(existing);
      }
      const id = window.setTimeout(() => {
        flipCommitTimersRef.current.delete(index);
        fn();
      }, delayMs);
      flipCommitTimersRef.current.set(index, id);
      return id;
    };

    const clearFlipTimers = () => {
      for (const id of flipScheduleTimersRef.current) {
        window.clearTimeout(id);
      }
      flipScheduleTimersRef.current.clear();
      for (const id of flipCommitTimersRef.current.values()) {
        window.clearTimeout(id);
      }
      flipCommitTimersRef.current.clear();
    };

    const commitFlip = (index: number, nextUrl: string) => {
      setTiles((latest) => {
        if (index >= latest.length) {
          return latest;
        }
        const copy = latest.slice();
        copy[index] = nextUrl;
        return copy;
      });
      flippingIndices.delete(index);
      setPendingFlips((active) =>
        active.filter((flip) => flip.index !== index),
      );
    };

    const tryStartFlip = () => {
      if (document.hidden || isSearchOverlayOpen()) {
        return;
      }
      const current = tilesRef.current;
      if (current.length === 0) {
        return;
      }
      const maxConcurrent = maxConcurrentFlips(current.length, flipProfile);
      if (flippingIndices.size >= maxConcurrent) {
        return;
      }

      let index = -1;
      for (let attempt = 0; attempt < FLIP_PICK_ATTEMPTS; attempt++) {
        const candidate = Math.floor(Math.random() * current.length);
        if (!flippingIndices.has(candidate)) {
          index = candidate;
          break;
        }
      }
      if (index < 0) {
        return;
      }

      const nextUrl = pickReplacementPoster(
        posters,
        current,
        index,
        colsRef.current,
      );
      if (!nextUrl || nextUrl === current[index]) {
        return;
      }

      const direction: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      flippingIndices.add(index);
      setPendingFlips((active) => [
        ...active,
        { index, url: nextUrl, direction },
      ]);
      trackCommitTimeout(
        index,
        () => {
          commitFlip(index, nextUrl);
        },
        FLIP_ANIM_MS,
      );
    };

    const scheduleNextStart = () => {
      if (document.hidden || isSearchOverlayOpen()) {
        return;
      }
      trackScheduleTimeout(() => {
        tryStartFlip();
        scheduleNextStart();
      }, nextFlipStaggerMs(flipProfile));
    };

    // Kick off a small burst so the first wave feels alive immediately.
    const burstCap = maxConcurrentFlips(
      tilesRef.current.length || 1,
      flipProfile,
    );
    const burst = Math.min(4, burstCap);
    const burstGapMs = flipProfile === 'sparse' ? 140 : 90;
    for (let i = 0; i < burst; i++) {
      trackScheduleTimeout(() => {
        tryStartFlip();
      }, i * burstGapMs);
    }
    scheduleNextStart();

    const onVisibility = () => {
      if (document.hidden) {
        clearFlipTimers();
        flippingIndices.clear();
        setPendingFlips([]);
        return;
      }
      scheduleNextStart();
    };

    const onSearchOpenAttr = () => {
      if (isSearchOverlayOpen()) {
        clearFlipTimers();
        flippingIndices.clear();
        setPendingFlips([]);
        return;
      }
      scheduleNextStart();
    };

    const searchOpenObserver = new MutationObserver(onSearchOpenAttr);
    searchOpenObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-search-open'],
    });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      searchOpenObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      clearFlipTimers();
      flippingIndices.clear();
      // No setState in cleanup — next effect start (or rebuild) clears pendingFlips.
    };
  }, [posters, reduceMotion, userPaused, flipProfile]);

  useEffect(() => {
    if (reduceMotion || !lensEnabled || posters.length === 0) {
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
      if (!layer) {
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const items = layer.children;
      const count = items.length;
      const cols = Math.max(1, colsRef.current);
      let centers = centersRef.current;
      if (!centers || centers.length !== count * 2) {
        recomputeTileCenters(layer, cols, centersRef);
        centers = centersRef.current;
      }
      if (!centers) {
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }

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
      if (loopRunningRef.current || document.hidden || isSearchOverlayOpen()) {
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
  }, [posters.length, reduceMotion, lensEnabled, tiles.length]);

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
          <PosterMosaicTile
            key={index}
            url={url}
            flip={pendingFlipByIndex.get(index) ?? null}
          />
        ))}
      </ul>
      <div className="poster-mosaic-veil absolute inset-0" />
    </div>
  );
}
