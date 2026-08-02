import { describe, expect, it } from 'vitest';

import {
  appendTiles,
  buildTiles,
  forbiddenPostersAt,
  neighborIndices,
  needsFullTileRebuild,
  pickPosterExcluding,
  pickReplacementPoster,
} from './poster-mosaic-tiles';

describe('neighborIndices', () => {
  it('returns the Chebyshev neighborhood inside the grid', () => {
    // 5x5 grid, center index 12 (row 2, col 2), radius 2 → 24 neighbors.
    const neighbors = neighborIndices(12, 5, 25, 2);
    expect(neighbors).toHaveLength(24);
    expect(neighbors).not.toContain(12);
    expect(neighbors).toContain(0);
    expect(neighbors).toContain(24);
  });

  it('clips at edges', () => {
    const neighbors = neighborIndices(0, 4, 16, 2);
    expect(neighbors.sort((a, b) => a - b)).toEqual([1, 2, 4, 5, 6, 8, 9, 10]);
  });
});

describe('pickPosterExcluding', () => {
  it('never returns a forbidden URL when alternatives exist', () => {
    const posters = ['a', 'b', 'c', 'd'];
    const forbidden = new Set(['a', 'b']);
    const rng = () => 0; // always sample index 0 first, then scan
    const picked = pickPosterExcluding(posters, forbidden, rng);
    expect(picked).not.toBeNull();
    expect(forbidden.has(picked!)).toBe(false);
  });

  it('returns null when every poster is forbidden', () => {
    const posters = ['a', 'b'];
    const forbidden = new Set(['a', 'b']);
    expect(pickPosterExcluding(posters, forbidden, () => 0.5)).toBeNull();
  });
});

describe('buildTiles / pickReplacementPoster', () => {
  it('avoids neighborhood collisions when the pool is large enough', () => {
    const posters = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const cols = 8;
    const tiles = buildTiles(posters, 64, cols, 42);
    expect(tiles).toHaveLength(64);

    for (let i = 0; i < tiles.length; i++) {
      const forbidden = forbiddenPostersAt(tiles, i, cols);
      // Self is in forbidden; neighbors must not match current.
      for (const neighbor of neighborIndices(i, cols, tiles.length, 2)) {
        expect(tiles[neighbor]).not.toBe(tiles[i]);
      }
      expect(forbidden.has(tiles[i]!)).toBe(true);
    }
  });

  it('picks a replacement that is not used by nearby tiles', () => {
    const posters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const cols = 5;
    // 5x5 grid; replace center (index 12). Radius-2 neighborhood uses a–y
    // slots below — leave 'i' and 'j' free outside that neighborhood pattern.
    const tiles = [
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'a',
      'b',
      'c',
      'd',
      'e', // center
      'f',
      'g',
      'h',
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'a',
    ];
    const next = pickReplacementPoster(posters, tiles, 12, cols, () => 0.99);
    expect(next).not.toBeNull();
    const forbidden = forbiddenPostersAt(tiles, 12, cols);
    expect(forbidden.has(next!)).toBe(false);
    expect(['i', 'j']).toContain(next);
  });
});

describe('appendTiles', () => {
  it('keeps the previous prefix and grows to the target count', () => {
    const posters = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const cols = 8;
    const prev = buildTiles(posters, 16, cols, 7);
    const grown = appendTiles(prev, posters, 32, cols, 7);
    expect(grown).toHaveLength(32);
    expect(grown.slice(0, 16)).toEqual(prev);
  });

  it('fills new indices with neighborhood-aware picks', () => {
    const posters = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const cols = 6;
    const prev = buildTiles(posters, 12, cols, 11);
    const grown = appendTiles(prev, posters, 24, cols, 11);
    for (let i = 12; i < grown.length; i++) {
      for (const neighbor of neighborIndices(i, cols, grown.length, 2)) {
        expect(grown[neighbor]).not.toBe(grown[i]);
      }
    }
  });

  it('is deterministic for the same inputs', () => {
    const posters = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const prev = buildTiles(posters, 10, 5, 3);
    expect(appendTiles(prev, posters, 20, 5, 3)).toEqual(
      appendTiles(prev, posters, 20, 5, 3),
    );
  });
});

describe('needsFullTileRebuild', () => {
  it('rebuilds when column count changes', () => {
    expect(
      needsFullTileRebuild({
        prevLength: 64,
        prevCols: 1,
        nextCols: 8,
        seedChanged: false,
      }),
    ).toBe(true);
  });

  it('rebuilds when seed changes or previous tiles are empty', () => {
    expect(
      needsFullTileRebuild({
        prevLength: 64,
        prevCols: 8,
        nextCols: 8,
        seedChanged: true,
      }),
    ).toBe(true);
    expect(
      needsFullTileRebuild({
        prevLength: 0,
        prevCols: 8,
        nextCols: 8,
        seedChanged: false,
      }),
    ).toBe(true);
  });

  it('does not rebuild for same cols/seed with existing tiles (append/slice path)', () => {
    expect(
      needsFullTileRebuild({
        prevLength: 64,
        prevCols: 8,
        nextCols: 8,
        seedChanged: false,
      }),
    ).toBe(false);
  });
});
