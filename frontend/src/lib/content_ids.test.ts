import { describe, expect, it } from 'vitest';

import { isContentUuid, parseTmdbIdParam } from './content_ids';

describe('isContentUuid', () => {
  it('accepts canonical UUIDs', () => {
    expect(isContentUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects non-UUIDs', () => {
    expect(isContentUuid('155')).toBe(false);
    expect(isContentUuid('155-the-dark-knight')).toBe(false);
  });
});

describe('parseTmdbIdParam', () => {
  it('returns null for content UUIDs', () => {
    expect(parseTmdbIdParam('550e8400-e29b-41d4-a716-446655440000')).toBe(
      null,
    );
  });

  it('parses bare numeric TMDb ids', () => {
    expect(parseTmdbIdParam('155')).toBe(155);
  });

  it('parses slug forms', () => {
    expect(parseTmdbIdParam('155-the-dark-knight')).toBe(155);
  });

  it('returns null for invalid paths', () => {
    expect(parseTmdbIdParam('')).toBe(null);
    expect(parseTmdbIdParam('abc')).toBe(null);
    expect(parseTmdbIdParam('the-dark-knight')).toBe(null);
  });

  it('returns null for zero and non-positive ids', () => {
    expect(parseTmdbIdParam('0')).toBe(null);
    expect(parseTmdbIdParam('0-title')).toBe(null);
  });

  it('returns null above Number.MAX_SAFE_INTEGER', () => {
    const unsafe = String(Number.MAX_SAFE_INTEGER + 1);
    expect(parseTmdbIdParam(unsafe)).toBe(null);
    expect(parseTmdbIdParam(`${unsafe}-slug`)).toBe(null);
  });

  it('accepts Number.MAX_SAFE_INTEGER', () => {
    const safe = String(Number.MAX_SAFE_INTEGER);
    expect(parseTmdbIdParam(safe)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
