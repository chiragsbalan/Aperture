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
 * value we sent upstream. Kept for callers that can re-read cookies after
 * an upstream round-trip; request-scoped Next.js cookies alone cannot see
 * a sibling tab's Set-Cookie. With API 10s reuse grace, refresh/me routes
 * clear on upstream 401 directly.
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

/** First hop from `x-forwarded-for`, else null. */
export function clientIpFromRequest(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first.slice(0, 64);
    }
  }
  return null;
}

/**
 * Forward JSON to the upstream auth API with trusted client-IP headers.
 *
 * Always overwrites `X-Aperture-Client-IP` / `X-Aperture-BFF-Secret` from the
 * browser request IP and server env — never trusts browser-supplied copies.
 */
export async function forwardAuthJson(
  request: NextRequest,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const clientIp = clientIpFromRequest(request);
  if (clientIp) {
    headers.set('X-Aperture-Client-IP', clientIp);
  } else {
    headers.delete('X-Aperture-Client-IP');
  }
  const secret = process.env.AUTH_BFF_SHARED_SECRET ?? '';
  headers.set('X-Aperture-BFF-Secret', secret);

  const base = upstreamApiBaseUrl();
  return fetch(`${base}${path}`, {
    ...init,
    headers,
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
