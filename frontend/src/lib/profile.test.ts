import { describe, expect, it } from 'vitest';

import { apiErrorMessage, initialsFromProfile } from './profile';

describe('initialsFromProfile', () => {
  it('uses display name words when present', () => {
    expect(initialsFromProfile('Ada Lovelace', 'ada')).toBe('AL');
  });

  it('falls back to username', () => {
    expect(initialsFromProfile(null, 'chirag_b')).toBe('CB');
    expect(initialsFromProfile('', 'ab')).toBe('AB');
  });
});

describe('apiErrorMessage', () => {
  it('reads string and object detail shapes', () => {
    expect(apiErrorMessage({ detail: 'Nope' }, 'fallback')).toBe('Nope');
    expect(
      apiErrorMessage(
        { detail: { message: 'Cooldown', username_rename_available_at: 'x' } },
        'fallback',
      ),
    ).toBe('Cooldown');
  });
});
