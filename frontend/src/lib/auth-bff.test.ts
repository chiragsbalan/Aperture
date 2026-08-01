import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearAuthCookiesIfRefreshUnchanged,
  clientIpFromRequest,
  forwardAuthJson,
} from './auth-bff';
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

describe('clientIpFromRequest', () => {
  it('uses the first x-forwarded-for hop', () => {
    const request = new NextRequest('http://localhost/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
    });
    expect(clientIpFromRequest(request)).toBe('203.0.113.9');
  });

  it('returns null when no forwarded header', () => {
    const request = new NextRequest('http://localhost/api/auth/login');
    expect(clientIpFromRequest(request)).toBeNull();
  });
});

describe('forwardAuthJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sets trusted IP headers from request and env (overwrites caller)', async () => {
    vi.stubEnv('AUTH_BFF_SHARED_SECRET', 'compose-shared-secret');
    vi.stubEnv('API_URL', 'http://api.test');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('http://localhost/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.44' },
    });
    await forwardAuthJson(request, '/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Aperture-Client-IP': 'spoofed',
        'X-Aperture-BFF-Secret': 'spoofed-secret',
      },
      body: '{}',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('X-Aperture-Client-IP')).toBe('203.0.113.44');
    expect(headers.get('X-Aperture-BFF-Secret')).toBe('compose-shared-secret');
    expect(headers.get('content-type')).toBe('application/json');
  });
});
