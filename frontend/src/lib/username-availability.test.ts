import { describe, expect, it } from 'vitest';

import { usernameAvailabilityCopy } from './username-availability';

describe('usernameAvailabilityCopy', () => {
  it('uses product copy without em dashes', () => {
    expect(usernameAvailabilityCopy('checking')).toBe('Checking username.');
    expect(usernameAvailabilityCopy('available')).toBe(
      'Username is available.',
    );
    expect(usernameAvailabilityCopy('taken')).toBe('Username is taken.');
    expect(usernameAvailabilityCopy('invalid')).toBe(
      'Username is unavailable.',
    );
    expect(usernameAvailabilityCopy('idle')).toBeNull();
  });
});
