import { describe, expect, it } from 'vitest';

import { usernameAvailabilityCopy } from './username-availability';

describe('usernameAvailabilityCopy', () => {
  it('uses product copy without em dashes', () => {
    expect(usernameAvailabilityCopy('checking')).toBe('Checking username.');
    expect(usernameAvailabilityCopy('available')).toBe(
      'Username is available.',
    );
    expect(usernameAvailabilityCopy('taken')).toBe(
      'This username is unavailable.',
    );
    expect(usernameAvailabilityCopy('invalid')).toBeNull();
    expect(usernameAvailabilityCopy('idle')).toBeNull();
  });
});
