/**
 * Auth cookie names and helpers (ADR-0003 transport · ADR-0005 auth).
 *
 * Production uses `__Host-` cookies (Secure, Path=/, no Domain).
 * Local HTTP cannot set `__Host-` cookies, so development falls back to
 * `ap_at` / `ap_rt` with Secure omitted.
 */

export const ACCESS_TOKEN_COOKIE = '__Host-ap_at' as const;
export const REFRESH_TOKEN_COOKIE = '__Host-ap_rt' as const;

const DEV_ACCESS_TOKEN_COOKIE = 'ap_at' as const;
const DEV_REFRESH_TOKEN_COOKIE = 'ap_rt' as const;

export interface AuthCookieOptions {
  maxAgeSeconds: number;
}

function hostPrefixEnabled(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function accessCookieName(): string {
  return hostPrefixEnabled() ? ACCESS_TOKEN_COOKIE : DEV_ACCESS_TOKEN_COOKIE;
}

export function refreshCookieName(): string {
  return hostPrefixEnabled() ? REFRESH_TOKEN_COOKIE : DEV_REFRESH_TOKEN_COOKIE;
}

/** Cookie attributes shared by access and refresh tokens. */
export function authCookieBaseOptions(maxAgeSeconds: number): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: hostPrefixEnabled(),
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function clearAuthCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return authCookieBaseOptions(0);
}
