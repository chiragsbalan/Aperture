/**
 * Pure helpers for the guest-shell poster mosaic tile URLs.
 */

/** Exclude posters used by tiles within this Chebyshev radius (incl. diagonals). */
export const POSTER_NEIGHBOR_RADIUS = 2;

/** Deterministic PRNG so SSR and the client's first paint match. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Indices of tiles within Chebyshev `radius` of `index` (not including self).
 * Grid is row-major with `cols` columns.
 */
export function neighborIndices(
  index: number,
  cols: number,
  tileCount: number,
  radius: number = POSTER_NEIGHBOR_RADIUS,
): number[] {
  if (cols < 1 || index < 0 || index >= tileCount) {
    return [];
  }
  const row = Math.floor(index / cols);
  const col = index % cols;
  const neighbors: number[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dr === 0 && dc === 0) {
        continue;
      }
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextCol < 0 || nextCol >= cols) {
        continue;
      }
      const nextIndex = nextRow * cols + nextCol;
      if (nextIndex >= 0 && nextIndex < tileCount) {
        neighbors.push(nextIndex);
      }
    }
  }
  return neighbors;
}

/**
 * URLs that must not be chosen for `index` (self + neighborhood).
 * `tileCount` defaults to `tiles.length`; pass the final grid size while
 * sequentially filling so future neighbor slots are still considered in-bounds
 * (unread slots simply contribute nothing yet).
 */
export function forbiddenPostersAt(
  tiles: readonly string[],
  index: number,
  cols: number,
  radius: number = POSTER_NEIGHBOR_RADIUS,
  tileCount: number = tiles.length,
): Set<string> {
  const forbidden = new Set<string>();
  const current = tiles[index];
  if (current) {
    forbidden.add(current);
  }
  for (const neighbor of neighborIndices(index, cols, tileCount, radius)) {
    const url = tiles[neighbor];
    if (url) {
      forbidden.add(url);
    }
  }
  return forbidden;
}

/**
 * Pick a poster URL not in `forbidden`. Tries random samples, then a linear
 * scan. Returns null only if every poster is forbidden.
 */
export function pickPosterExcluding(
  posters: readonly string[],
  forbidden: ReadonlySet<string>,
  rng: () => number,
): string | null {
  if (posters.length === 0) {
    return null;
  }

  const maxAttempts = Math.min(32, posters.length * 2);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const url = posters[Math.floor(rng() * posters.length)]!;
    if (!forbidden.has(url)) {
      return url;
    }
  }

  const start = Math.floor(rng() * posters.length);
  for (let offset = 0; offset < posters.length; offset++) {
    const url = posters[(start + offset) % posters.length]!;
    if (!forbidden.has(url)) {
      return url;
    }
  }
  return null;
}

/** Build a full tile list, avoiding neighborhood collisions when possible. */
export function buildTiles(
  posters: readonly string[],
  count: number,
  cols: number,
  seed: number,
): string[] {
  const rng = mulberry32(seed);
  const tiles: string[] = [];
  if (posters.length === 0 || count < 1) {
    return tiles;
  }

  const safeCols = Math.max(1, cols);
  for (let i = 0; i < count; i++) {
    // Bound neighborhood to the final grid so left/above tiles are excluded.
    const forbidden = forbiddenPostersAt(
      tiles,
      i,
      safeCols,
      POSTER_NEIGHBOR_RADIUS,
      count,
    );
    const picked = pickPosterExcluding(posters, forbidden, rng);
    tiles.push(picked ?? posters[Math.floor(rng() * posters.length)]!);
  }
  return tiles;
}

/**
 * Grow an existing tile list to `targetCount`, keeping the `prev` prefix.
 * New slots use neighborhood-aware picks against the growing grid.
 * RNG is seeded with an offset so appends are deterministic and distinct
 * from a full `buildTiles` of the same length.
 */
export function appendTiles(
  prev: readonly string[],
  posters: readonly string[],
  targetCount: number,
  cols: number,
  seed: number,
): string[] {
  if (posters.length === 0 || targetCount < 1) {
    return [];
  }
  if (targetCount <= prev.length) {
    return prev.slice(0, targetCount);
  }

  const safeCols = Math.max(1, cols);
  const rng = mulberry32((seed + prev.length) >>> 0);
  const tiles = prev.slice();
  for (let i = prev.length; i < targetCount; i++) {
    const forbidden = forbiddenPostersAt(
      tiles,
      i,
      safeCols,
      POSTER_NEIGHBOR_RADIUS,
      targetCount,
    );
    const picked = pickPosterExcluding(posters, forbidden, rng);
    tiles.push(picked ?? posters[Math.floor(rng() * posters.length)]!);
  }
  return tiles;
}

/**
 * Whether the mosaic must fully rebuild tile URLs (vs append / slice).
 * Column changes invalidate neighborhood adjacency of the existing prefix.
 */
export function needsFullTileRebuild(options: {
  prevLength: number;
  prevCols: number;
  nextCols: number;
  seedChanged: boolean;
}): boolean {
  return (
    options.seedChanged ||
    options.prevLength === 0 ||
    options.prevCols !== options.nextCols
  );
}

/** Choose a replacement URL for one tile under the neighborhood constraint. */
export function pickReplacementPoster(
  posters: readonly string[],
  tiles: readonly string[],
  index: number,
  cols: number,
  rng: () => number = Math.random,
): string | null {
  if (index < 0 || index >= tiles.length || posters.length === 0) {
    return null;
  }
  return pickPosterExcluding(
    posters,
    forbiddenPostersAt(tiles, index, Math.max(1, cols)),
    rng,
  );
}
