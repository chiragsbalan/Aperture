import { describe, expect, it } from 'vitest';

import {
  HOME_CATALOG_RAIL_HEADINGS,
  decideSignedInHomeShell,
  shouldPrefetchHomeRails,
  type HomeShellMeOutcome,
} from './home-shell';

describe('shouldPrefetchHomeRails', () => {
  it('is false for access-only (no refresh) so rail fetchers are not started', () => {
    expect(shouldPrefetchHomeRails(false)).toBe(false);
  });

  it('is true when a refresh cookie is present', () => {
    expect(shouldPrefetchHomeRails(true)).toBe(true);
  });

  it('stays refresh-gated independently of shell decision outcomes', () => {
    // Access-only + ok would be signed-in shell, but must not prefetch.
    expect(
      decideSignedInHomeShell({
        hasAccess: true,
        hasRefresh: false,
        outcome: 'ok',
      }),
    ).toBe(true);
    expect(shouldPrefetchHomeRails(false)).toBe(false);

    // Refresh-only is signed-in and may prefetch.
    expect(
      decideSignedInHomeShell({ hasAccess: false, hasRefresh: true }),
    ).toBe(true);
    expect(shouldPrefetchHomeRails(true)).toBe(true);
  });
});

describe('decideSignedInHomeShell', () => {
  it('no cookies → guest', () => {
    expect(
      decideSignedInHomeShell({ hasAccess: false, hasRefresh: false }),
    ).toBe(false);
  });

  it('refresh-only → signed-in before fetch (outcome ignored)', () => {
    const outcomes: Array<HomeShellMeOutcome | undefined> = [
      undefined,
      'ok',
      'unauthorized',
      'rate_limited',
      'other_http',
      'network',
      'config_error',
    ];
    for (const outcome of outcomes) {
      expect(
        decideSignedInHomeShell({
          hasAccess: false,
          hasRefresh: true,
          outcome,
        }),
      ).toBe(true);
    }
  });

  it('access + ok → signed-in (with or without refresh)', () => {
    expect(
      decideSignedInHomeShell({
        hasAccess: true,
        hasRefresh: false,
        outcome: 'ok',
      }),
    ).toBe(true);
    expect(
      decideSignedInHomeShell({
        hasAccess: true,
        hasRefresh: true,
        outcome: 'ok',
      }),
    ).toBe(true);
  });

  it.each([
    'unauthorized',
    'rate_limited',
    'other_http',
    'network',
    'config_error',
  ] as const)(
    'access + %s → guest without refresh; signed-in with refresh',
    (outcome) => {
      expect(
        decideSignedInHomeShell({
          hasAccess: true,
          hasRefresh: false,
          outcome,
        }),
      ).toBe(false);
      expect(
        decideSignedInHomeShell({
          hasAccess: true,
          hasRefresh: true,
          outcome,
        }),
      ).toBe(true);
    },
  );

  it('access without outcome → guest (incomplete probe)', () => {
    expect(
      decideSignedInHomeShell({ hasAccess: true, hasRefresh: true }),
    ).toBe(false);
  });
});

describe('HomeCatalogRails headings', () => {
  it('defines the three rail headings from props', () => {
    expect(HOME_CATALOG_RAIL_HEADINGS).toEqual([
      'Now in theatres',
      'Top movies',
      'Top TV shows',
    ]);
  });
});
