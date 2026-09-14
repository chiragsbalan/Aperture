import { afterEach, describe, expect, it } from 'vitest';

import {
  registerReturnToMarketing,
  requestReturnToMarketing,
} from './guest-landing-return';

describe('requestReturnToMarketing', () => {
  afterEach(() => {
    registerReturnToMarketing(() => false)();
  });

  it('falls through when no auth surface is mounted', () => {
    expect(requestReturnToMarketing()).toBe(false);
  });

  it('uses the registered slide and ignores a stale unregister', () => {
    let slides = 0;
    const unregister = registerReturnToMarketing(() => {
      slides += 1;
      return true;
    });

    expect(requestReturnToMarketing()).toBe(true);
    expect(slides).toBe(1);

    unregister();
    expect(requestReturnToMarketing()).toBe(false);
  });
});
