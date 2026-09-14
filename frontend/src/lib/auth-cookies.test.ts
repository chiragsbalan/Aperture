import { describe, expect, it } from 'vitest';

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessCookieName,
  authCookieBaseOptions,
  hasAuthSessionCookie,
  refreshCookieName,
} from './auth-cookies';

describe('auth cookies', () => {
  it('exposes reserved production cookie names', () => {
    expect(ACCESS_TOKEN_COOKIE).toBe('__Host-ap_at');
    expect(REFRESH_TOKEN_COOKIE).toBe('__Host-ap_rt');
  });

  it('uses non-Host names outside production', () => {
    expect(accessCookieName()).toBe('ap_at');
    expect(refreshCookieName()).toBe('ap_rt');
  });

  it('treats either environment session cookie as signed in', () => {
    expect(hasAuthSessionCookie((name) => name === 'ap_rt')).toBe(true);
    expect(hasAuthSessionCookie((name) => name === '__Host-ap_at')).toBe(true);
    expect(hasAuthSessionCookie(() => false)).toBe(false);
  });

  it('sets Lax cookies with Path=/ and no Domain', () => {
    const options = authCookieBaseOptions(900);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 900,
      secure: false,
    });
  });
});
