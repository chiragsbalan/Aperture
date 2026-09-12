import { describe, expect, it } from 'vitest';

import { formatIsoMonthYear } from './iso_date';

describe('formatIsoMonthYear', () => {
  it('formats a UTC calendar date as month and year', () => {
    expect(formatIsoMonthYear('1999-03-31')).toBe('March 1999');
  });

  it('falls back to a four-digit year', () => {
    expect(formatIsoMonthYear('2001')).toBe('2001');
  });

  it('returns null for empty or junk', () => {
    expect(formatIsoMonthYear(null)).toBeNull();
    expect(formatIsoMonthYear('')).toBeNull();
    expect(formatIsoMonthYear('soon')).toBeNull();
  });
});
