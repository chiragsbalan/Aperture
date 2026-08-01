/**
 * Shared helpers for BFF auth route handlers.
 */

import { upstreamApiBaseUrl } from '@/lib/api';
import {
  accessCookieName,
  authCookieBaseOptions,
  clearAuthCookieOptions,
  refreshCookieName,
} from '@/lib/auth-cookies';
import { UPSTREAM_FETCH_TIMEOUT_MS } from '@/lib/bff-proxy';
import { type NextRequest, NextResponse } from 'next/server';

export interface TokenPayload {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function parseTokenPayload(data: unknown): TokenPayload | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (
    typeof record.access_token !== 'string' ||
    typeof record.refresh_token !== 'string' ||
    typeof record.expires_in !== 'number'
  ) {
    return null;
  }
  return {
    access_token: record.access_token,
    refresh_token: record.refresh_token,
    token_type:
      typeof record.token_type === 'string' ? record.token_type : 'bearer',
    expires_in: record.expires_in,
  };
}

export function applyAuthCookies(
  response: NextResponse,
  tokens: TokenPayload,
): void {
  response.cookies.set(
    accessCookieName(),
    tokens.access_token,
    authCookieBaseOptions(tokens.expires_in),
  );
  response.cookies.set(
    refreshCookieName(),
    tokens.refresh_token,
    authCookieBaseOptions(REFRESH_MAX_AGE_SECONDS),
  );
}

export function clearAuthCookies(response: NextResponse): void {
  const cleared = clearAuthCookieOptions();
  response.cookies.set(accessCookieName(), '', cleared);
  response.cookies.set(refreshCookieName(), '', cleared);
}

/**
 * Clear auth cookies only when the refresh cookie is unchanged from the
 * value we sent upstream. Used so a concurrent rotator cannot wipe a
 * winner's cookies when a re-read is available.
 *
 * Note: Next.js request cookies are per-invocation, so multi-tab losers
 * still see sent===current. For P1.1, refresh/me handlers must not clear
 * on upstream refresh 401 at all (401 body only). Full grace + singleflight
 * is P1.2.
 */
export function clearAuthCookiesIfRefreshUnchanged(
  response: NextResponse,
  currentRefreshCookie: string | undefined,
  sentRefresh: string,
): boolean {
  if (currentRefreshCookie !== sentRefresh) {
    return false;
  }
  clearAuthCookies(response);
  return true;
}

export async function forwardAuthJson(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const base = upstreamApiBaseUrl();
  return fetch(`${base}${path}`, {
    ...init,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
  });
}

export async function readJsonBody(
  request: NextRequest,
): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function jsonError(detail: string, status: number): NextResponse {
  return NextResponse.json({ detail }, { status });
}
