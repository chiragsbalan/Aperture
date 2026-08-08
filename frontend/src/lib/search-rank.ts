/**
 * @fileoverview Client-side title match tiers for unified search ranking.
 *
 * Additive to FTS / External / Related: every title is scored by how the
 * query appears in the title, then by source. Lower tier = stronger match.
 *
 * 0 word-boundary sequence (e.g. "gru" in "Rise of Gru")
 * 1 FTS hit without a literal substring (stem / overview match)
 * 2 embedded sequence inside a longer token (e.g. "gru" in "Grunge")
 * 3 Related enrichment
 * 4 other External
 *
 * Within a tier: catalog (content_id) first by hybrid popularity, then
 * TMDb-only cards by popularity. Popularity is Aperture rating_count at/above
 * the switch threshold, else TMDB vote_count (ADR-0015).
 */

export type TitleMatchSource = 'fts' | 'external' | 'related';

export interface RankableTitle {
  tier: number;
  /** Warm catalog UUID when known; null for cold TMDb-only cards. */
  contentId: string | null;
  popularity: number;
  order: number;
}

/** Lower is a stronger match. */
export function titleMatchTier(
  query: string,
  title: string,
  source: TitleMatchSource,
): number {
  const q = query.trim().toLowerCase();
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundary = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escaped}(?=[^\\p{L}\\p{N}]|$)`,
      'iu',
    );
    if (wordBoundary.test(title)) {
      return 0;
    }
    if (title.toLowerCase().includes(q)) {
      return 2;
    }
  }
  if (source === 'fts') {
    return 1;
  }
  if (source === 'related') {
    return 3;
  }
  return 4;
}

/** Sort comparator: tier → catalog-before-TMDb → higher popularity → stable. */
export function compareRankableTitles(
  a: RankableTitle,
  b: RankableTitle,
): number {
  if (a.tier !== b.tier) {
    return a.tier - b.tier;
  }
  const aCatalog = a.contentId != null ? 0 : 1;
  const bCatalog = b.contentId != null ? 0 : 1;
  if (aCatalog !== bCatalog) {
    return aCatalog - bCatalog;
  }
  if (a.popularity !== b.popularity) {
    return b.popularity - a.popularity;
  }
  return a.order - b.order;
}
