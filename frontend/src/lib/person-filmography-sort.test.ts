import { describe, expect, it } from 'vitest';

import type { PersonTitleCard } from './catalog';
import {
  buildPersonFilmographyTimeline,
  groupFilmographyByYear,
  resolvePersonDepartment,
  sortPersonFilmography,
} from './person-filmography-sort';

function card(
  overrides: Partial<PersonTitleCard> & Pick<PersonTitleCard, 'title'>,
): PersonTitleCard {
  return {
    type: 'movie',
    content_id: null,
    tmdb_id: 1,
    year: 2000,
    poster_url: null,
    credit_kind: 'cast',
    character: null,
    job: null,
    department: 'Acting',
    popularity: null,
    release_date: null,
    runtime_minutes: null,
    rating: null,
    ...overrides,
  };
}

describe('sortPersonFilmography', () => {
  it('sorts by popularity descending, missing as zero', () => {
    const sorted = sortPersonFilmography(
      [
        card({ title: 'Low', popularity: 1, year: 1999 }),
        card({ title: 'None', popularity: null, year: 2001 }),
        card({ title: 'High', popularity: 10, year: 2000 }),
      ],
      'popularity',
    );
    expect(sorted.map((row) => row.title)).toEqual(['High', 'Low', 'None']);
  });

  it('sorts names A-Z then Z-A', () => {
    const rows = [
      card({ title: 'Zodiac', year: 2007 }),
      card({ title: 'Amelie', year: 2001 }),
    ];
    expect(
      sortPersonFilmography(rows, 'name_asc').map((row) => row.title),
    ).toEqual(['Amelie', 'Zodiac']);
    expect(
      sortPersonFilmography(rows, 'name_desc').map((row) => row.title),
    ).toEqual(['Zodiac', 'Amelie']);
  });

  it('uses full release_date then year; missing dates last', () => {
    const rows = [
      card({
        title: 'Undated',
        year: null,
        release_date: null,
      }),
      card({
        title: 'Year only',
        year: 1999,
        release_date: null,
      }),
      card({
        title: 'Exact',
        year: 1999,
        release_date: '1999-12-31',
      }),
    ];
    expect(
      sortPersonFilmography(rows, 'date_newest').map((row) => row.title),
    ).toEqual(['Exact', 'Year only', 'Undated']);
    expect(
      sortPersonFilmography(rows, 'date_oldest').map((row) => row.title),
    ).toEqual(['Year only', 'Exact', 'Undated']);
  });

  it('sorts average rating with missing last', () => {
    const rows = [
      card({
        title: 'Mid',
        rating: { value: 3, source: 'tmdb', count: 10 },
      }),
      card({ title: 'None', rating: null }),
      card({
        title: 'High',
        rating: { value: 4.5, source: 'tmdb', count: 10 },
      }),
    ];
    expect(
      sortPersonFilmography(rows, 'rating_high').map((row) => row.title),
    ).toEqual(['High', 'Mid', 'None']);
    expect(
      sortPersonFilmography(rows, 'rating_low').map((row) => row.title),
    ).toEqual(['Mid', 'High', 'None']);
  });

  it('puts missing runtime last for both length directions', () => {
    const rows = [
      card({ title: 'Long', runtime_minutes: 180 }),
      card({ title: 'Unknown', runtime_minutes: null }),
      card({ title: 'Short', runtime_minutes: 90 }),
    ];
    expect(
      sortPersonFilmography(rows, 'runtime_short').map((row) => row.title),
    ).toEqual(['Short', 'Long', 'Unknown']);
    expect(
      sortPersonFilmography(rows, 'runtime_long').map((row) => row.title),
    ).toEqual(['Long', 'Short', 'Unknown']);
  });

  it('ranks your ratings first, then average in the same direction', () => {
    const rows = [
      card({
        title: 'Unrated high avg',
        content_id: '11111111-1111-1111-1111-111111111111',
        rating: { value: 5, source: 'tmdb', count: 10 },
      }),
      card({
        title: 'My low',
        content_id: '22222222-2222-2222-2222-222222222222',
        rating: { value: 4, source: 'tmdb', count: 10 },
      }),
      card({
        title: 'My high',
        content_id: '33333333-3333-3333-3333-333333333333',
        rating: { value: 2, source: 'tmdb', count: 10 },
      }),
      card({
        title: 'Unrated low avg',
        content_id: '44444444-4444-4444-4444-444444444444',
        rating: { value: 1, source: 'tmdb', count: 10 },
      }),
    ];
    const mine = {
      'movie:22222222-2222-2222-2222-222222222222': 2,
      'movie:33333333-3333-3333-3333-333333333333': 5,
    };
    expect(
      sortPersonFilmography(rows, 'your_rating_high', mine).map(
        (row) => row.title,
      ),
    ).toEqual(['My high', 'My low', 'Unrated high avg', 'Unrated low avg']);
    expect(
      sortPersonFilmography(rows, 'your_rating_low', mine).map(
        (row) => row.title,
      ),
    ).toEqual(['My low', 'My high', 'Unrated low avg', 'Unrated high avg']);
  });
});

describe('groupFilmographyByYear', () => {
  it('orders years newest to oldest regardless of card order', () => {
    const groups = groupFilmographyByYear([
      card({ title: 'A', year: 1999 }),
      card({ title: 'B', year: 2020 }),
      card({ title: 'C', year: 1999 }),
      card({ title: 'D', year: null }),
    ]);
    expect(groups.map((group) => group.yearLabel)).toEqual([
      '2020',
      '1999',
      'Unknown year',
    ]);
    expect(groups[1]?.cards.map((row) => row.title)).toEqual(['A', 'C']);
  });

  it('puts unknown year last even when those titles appear first', () => {
    const groups = groupFilmographyByYear([
      card({ title: 'TBA', year: null }),
      card({ title: 'A', year: 2026 }),
      card({ title: 'B', year: 2022 }),
      card({ title: 'TBA 2', year: null }),
    ]);
    expect(groups.map((group) => group.yearLabel)).toEqual([
      '2026',
      '2022',
      'Unknown year',
    ]);
    expect(groups[2]?.cards.map((row) => row.title)).toEqual(['TBA', 'TBA 2']);
  });
});

describe('buildPersonFilmographyTimeline', () => {
  it('keeps year headers newest to oldest under popularity sort', () => {
    const timeline = buildPersonFilmographyTimeline(
      [
        card({ title: 'Old hit', year: 1999, popularity: 100 }),
        card({ title: 'New niche', year: 2020, popularity: 1 }),
        card({ title: 'New hit', year: 2020, popularity: 50 }),
        card({ title: 'TBA', year: null, popularity: 200 }),
      ],
      'popularity',
    );
    expect(timeline.map((group) => group.yearLabel)).toEqual([
      '2020',
      '1999',
      'Unknown year',
    ]);
    expect(timeline[0]?.cards.map((row) => row.title)).toEqual([
      'New hit',
      'New niche',
    ]);
    expect(timeline[1]?.cards.map((row) => row.title)).toEqual(['Old hit']);
    expect(timeline[2]?.cards.map((row) => row.title)).toEqual(['TBA']);
  });

  it('sorts within each year only for name A-Z', () => {
    const timeline = buildPersonFilmographyTimeline(
      [
        card({ title: 'Zebra', year: 2010 }),
        card({ title: 'Apple', year: 2010 }),
        card({ title: 'Moon', year: 2005 }),
        card({ title: 'Lake', year: 2005 }),
      ],
      'name_asc',
    );
    expect(timeline.map((group) => group.yearLabel)).toEqual(['2010', '2005']);
    expect(timeline[0]?.cards.map((row) => row.title)).toEqual([
      'Apple',
      'Zebra',
    ]);
    expect(timeline[1]?.cards.map((row) => row.title)).toEqual([
      'Lake',
      'Moon',
    ]);
  });
});

describe('resolvePersonDepartment', () => {
  it('prefers known-for department when present', () => {
    expect(
      resolvePersonDepartment('Directing', [
        'Acting',
        'Production',
        'Directing',
      ]),
    ).toBe('Directing');
  });

  it('maps Director to Directing', () => {
    expect(resolvePersonDepartment('Director', ['Acting', 'Directing'])).toBe(
      'Directing',
    );
  });

  it('falls back to the first listed department', () => {
    expect(resolvePersonDepartment(null, ['Acting', 'Writing'])).toBe('Acting');
  });
});
