/**
 * @fileoverview Client filter/sort for person filmography (≤150 cards).
 */

import type { PersonTitleCard } from './catalog';

const KNOWN_FOR_DEPARTMENT_ALIASES: Record<string, string> = {
  director: 'Directing',
  directing: 'Directing',
  actor: 'Acting',
  actress: 'Acting',
  acting: 'Acting',
};

/** Profession select default: known-for department when it exists in the list. */
export function resolvePersonDepartment(
  knownForDepartment: string | null | undefined,
  departments: readonly string[],
): string {
  if (departments.length === 0) {
    return 'Acting';
  }
  const wanted = (knownForDepartment ?? '').trim();
  if (wanted) {
    const exact = departments.find((dept) => dept === wanted);
    if (exact != null) {
      return exact;
    }
    const lower = wanted.toLowerCase();
    const ci = departments.find((dept) => dept.toLowerCase() === lower);
    if (ci != null) {
      return ci;
    }
    const alias = KNOWN_FOR_DEPARTMENT_ALIASES[lower];
    if (alias != null) {
      const mapped = departments.find((dept) => dept === alias);
      if (mapped != null) {
        return mapped;
      }
    }
  }
  return departments[0] ?? 'Acting';
}

export type PersonFilmographySort =
  | 'popularity'
  | 'name_asc'
  | 'name_desc'
  | 'date_newest'
  | 'date_oldest'
  | 'rating_high'
  | 'rating_low'
  | 'your_rating_high'
  | 'your_rating_low'
  | 'runtime_short'
  | 'runtime_long';

export interface PersonFilmographySortOption {
  value: PersonFilmographySort;
  label: string;
  signedInOnly?: boolean;
}

export const PERSON_FILMOGRAPHY_SORT_OPTIONS: readonly PersonFilmographySortOption[] =
  [
    { value: 'popularity', label: 'Popularity' },
    { value: 'name_asc', label: 'Film name A-Z' },
    { value: 'name_desc', label: 'Film name Z-A' },
    { value: 'date_newest', label: 'Release date newest' },
    { value: 'date_oldest', label: 'Release date oldest' },
    { value: 'rating_high', label: 'Average rating highest' },
    { value: 'rating_low', label: 'Average rating lowest' },
    {
      value: 'your_rating_high',
      label: 'Your rating highest',
      signedInOnly: true,
    },
    {
      value: 'your_rating_low',
      label: 'Your rating lowest',
      signedInOnly: true,
    },
    { value: 'runtime_short', label: 'Film length shortest' },
    { value: 'runtime_long', label: 'Film length longest' },
  ];

export function isPersonFilmographySort(
  value: string,
): value is PersonFilmographySort {
  return PERSON_FILMOGRAPHY_SORT_OPTIONS.some(
    (option) => option.value === value,
  );
}

function titleKey(card: PersonTitleCard): string {
  return card.title.toLowerCase();
}

function cmpTitleYear(a: PersonTitleCard, b: PersonTitleCard): number {
  const byTitle = titleKey(a).localeCompare(titleKey(b));
  if (byTitle !== 0) {
    return byTitle;
  }
  return (a.year ?? 0) - (b.year ?? 0);
}

function popularityValue(card: PersonTitleCard): number {
  return card.popularity ?? 0;
}

function averageRating(card: PersonTitleCard): number | null {
  const value = card.rating?.value;
  return typeof value === 'number' ? value : null;
}

function dateSortValue(card: PersonTitleCard): number | null {
  if (card.release_date != null && card.release_date.length >= 10) {
    const parsed = Date.parse(card.release_date.slice(0, 10));
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  if (card.year != null) {
    return Date.UTC(card.year, 0, 1);
  }
  return null;
}

function cardRatingKey(card: PersonTitleCard): string | null {
  if (card.content_id == null) {
    return null;
  }
  return `${card.type}:${card.content_id}`;
}

function myRating(
  card: PersonTitleCard,
  ratings: Record<string, number>,
): number | null {
  const key = cardRatingKey(card);
  if (key == null) {
    return null;
  }
  const value = ratings[key];
  return typeof value === 'number' ? value : null;
}

function cmpNullableNumber(
  a: number | null,
  b: number | null,
  direction: 1 | -1,
): number | null {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return 1;
  }
  if (b == null) {
    return -1;
  }
  const delta = (a - b) * direction;
  return delta === 0 ? 0 : delta;
}

export function sortPersonFilmography(
  cards: readonly PersonTitleCard[],
  sort: PersonFilmographySort,
  myRatings: Record<string, number> = {},
): PersonTitleCard[] {
  const copy = [...cards];
  copy.sort((a, b) => {
    switch (sort) {
      case 'popularity': {
        const delta = popularityValue(b) - popularityValue(a);
        return delta !== 0 ? delta : cmpTitleYear(a, b);
      }
      case 'name_asc':
        return cmpTitleYear(a, b);
      case 'name_desc':
        return cmpTitleYear(b, a);
      case 'date_newest':
      case 'date_oldest': {
        const direction: 1 | -1 = sort === 'date_oldest' ? 1 : -1;
        const cmp = cmpNullableNumber(
          dateSortValue(a),
          dateSortValue(b),
          direction,
        );
        return cmp != null && cmp !== 0 ? cmp : cmpTitleYear(a, b);
      }
      case 'rating_high':
      case 'rating_low': {
        const direction: 1 | -1 = sort === 'rating_low' ? 1 : -1;
        const cmp = cmpNullableNumber(
          averageRating(a),
          averageRating(b),
          direction,
        );
        return cmp != null && cmp !== 0 ? cmp : cmpTitleYear(a, b);
      }
      case 'runtime_short':
      case 'runtime_long': {
        const direction: 1 | -1 = sort === 'runtime_short' ? 1 : -1;
        const cmp = cmpNullableNumber(
          a.runtime_minutes,
          b.runtime_minutes,
          direction,
        );
        return cmp != null && cmp !== 0 ? cmp : cmpTitleYear(a, b);
      }
      case 'your_rating_high':
      case 'your_rating_low': {
        const mineA = myRating(a, myRatings);
        const mineB = myRating(b, myRatings);
        const aRated = mineA != null;
        const bRated = mineB != null;
        if (aRated !== bRated) {
          return aRated ? -1 : 1;
        }
        const direction: 1 | -1 = sort === 'your_rating_low' ? 1 : -1;
        if (aRated && bRated) {
          const delta = (mineA - mineB) * direction;
          return delta !== 0 ? delta : cmpTitleYear(a, b);
        }
        const cmp = cmpNullableNumber(
          averageRating(a),
          averageRating(b),
          direction,
        );
        return cmp != null && cmp !== 0 ? cmp : cmpTitleYear(a, b);
      }
      default:
        return cmpTitleYear(a, b);
    }
  });
  return copy;
}

/**
 * Group cards by calendar year. Year headers are always newest → oldest;
 * Unknown year is always last. Within-year card order is preserved as given
 * (FormSelect sort is applied separately via ``buildPersonFilmographyTimeline``).
 */
export function groupFilmographyByYear(
  cards: readonly PersonTitleCard[],
): Array<{ yearLabel: string; cards: PersonTitleCard[] }> {
  const byYear = new Map<number | null, PersonTitleCard[]>();
  for (const card of cards) {
    const key = card.year;
    const existing = byYear.get(key);
    if (existing == null) {
      byYear.set(key, [card]);
    } else {
      existing.push(card);
    }
  }
  const dated = [...byYear.keys()]
    .filter((year): year is number => year != null)
    .sort((a, b) => b - a);
  const hasUnknown = byYear.has(null);
  const years: Array<number | null> = hasUnknown ? [...dated, null] : dated;
  return years.map((year) => ({
    yearLabel: year == null ? 'Unknown year' : String(year),
    cards: byYear.get(year) ?? [],
  }));
}

/**
 * Chronological year buckets (newest → oldest) with FormSelect sort applied
 * within each year only. Global popularity (or any other sort) does not
 * reorder year headers.
 */
export function buildPersonFilmographyTimeline(
  cards: readonly PersonTitleCard[],
  sort: PersonFilmographySort,
  myRatings: Record<string, number> = {},
): Array<{ yearLabel: string; cards: PersonTitleCard[] }> {
  return groupFilmographyByYear(cards).map((group) => ({
    yearLabel: group.yearLabel,
    cards: sortPersonFilmography(group.cards, sort, myRatings),
  }));
}
