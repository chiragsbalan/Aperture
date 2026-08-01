import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';

import { clearAuthCookiesIfRefreshUnchanged } from './auth-bff';
import { accessCookieName, refreshCookieName } from './auth-cookies';

function cookieNames(response: NextResponse): string[] {
  return response.cookies.getAll().map((cookie) => cookie.name);
}

describe('clearAuthCookiesIfRefreshUnchanged', () => {
  it('clears cookies when current refresh equals sent', () => {
    const response = NextResponse.json({ ok: true });
    const cleared = clearAuthCookiesIfRefreshUnchanged(
      response,
      'same-refresh-token',
      'same-refresh-token',
    );
    expect(cleared).toBe(true);
    expect(cookieNames(response)).toEqual(
      expect.arrayContaining([accessCookieName(), refreshCookieName()]),
    );
  });

  it('does not clear cookies when refresh cookie already differs', () => {
    const response = NextResponse.json({ ok: true });
    const cleared = clearAuthCookiesIfRefreshUnchanged(
      response,
      'winner-rotated-token',
      'loser-stale-token',
    );
    expect(cleared).toBe(false);
    expect(cookieNames(response)).toEqual([]);
  });
});
