import { describe, expect, it } from 'vitest';

import { compareRankableTitles, titleMatchTier } from '@/lib/search-rank';

describe('titleMatchTier', () => {
  it('prefers word-boundary matches', () => {
    expect(titleMatchTier('gru', 'Rise of Gru', 'fts')).toBe(0);
  });

  it('ranks embedded matches after FTS stem hits', () => {
    expect(titleMatchTier('gru', 'Grunge', 'fts')).toBe(2);
    expect(titleMatchTier('xyzzy', 'Some Title', 'fts')).toBe(1);
  });
});

describe('compareRankableTitles', () => {
  it('sorts by tier then catalog before TMDb then popularity', () => {
    const ranked = [
      {
        tier: 0,
        contentId: null,
        popularity: 9000,
        order: 0,
      },
      {
        tier: 0,
        contentId: 'warm-a',
        popularity: 10,
        order: 1,
      },
      {
        tier: 0,
        contentId: 'warm-b',
        popularity: 50,
        order: 2,
      },
      {
        tier: 1,
        contentId: 'warm-c',
        popularity: 99999,
        order: 3,
      },
    ].sort(compareRankableTitles);

    expect(ranked.map((row) => row.contentId)).toEqual([
      'warm-b',
      'warm-a',
      null,
      'warm-c',
    ]);
  });
});
