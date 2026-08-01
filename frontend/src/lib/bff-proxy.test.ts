import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildUpstreamUrl,
  clientIpFromRequest,
  filterRequestHeaders,
  filterResponseHeaders,
  injectTrustedClientIpHeaders,
  isDeniedProxyPath,
} from './bff-proxy';

describe('isDeniedProxyPath', () => {
  it('denies api/v1/auth and subpaths', () => {
    expect(isDeniedProxyPath(['api', 'v1', 'auth'])).toBe(true);
    expect(isDeniedProxyPath(['api', 'v1', 'auth', 'login'])).toBe(true);
    expect(isDeniedProxyPath(['api', 'v1', 'auth', 'refresh'])).toBe(true);
  });

  it('allows health, version, and other api paths', () => {
    expect(isDeniedProxyPath(['health', 'ready'])).toBe(false);
    expect(isDeniedProxyPath(['version'])).toBe(false);
    expect(isDeniedProxyPath(['api', 'v1', 'users'])).toBe(false);
    expect(isDeniedProxyPath(['api', 'v1'])).toBe(false);
  });
});

describe('buildUpstreamUrl', () => {
  const base = 'http://api:8000';

  it('builds a pinned upstream URL', () => {
    const url = buildUpstreamUrl(base, ['health', 'ready'], '');
    expect(url?.href).toBe('http://api:8000/health/ready');
  });

  it('preserves query strings', () => {
    const url = buildUpstreamUrl(base, ['version'], '?x=1');
    expect(url?.href).toBe('http://api:8000/version?x=1');
  });

  it('rejects traversal segments', () => {
    expect(buildUpstreamUrl(base, ['..', 'secret'], '')).toBeNull();
    expect(buildUpstreamUrl(base, ['a\\b'], '')).toBeNull();
  });

  it('rejects empty paths', () => {
    expect(buildUpstreamUrl(base, [], '')).toBeNull();
  });
});

describe('filterRequestHeaders', () => {
  it('allowlists safe headers and drops cookie / forwarded', () => {
    const source = new Headers({
      Accept: 'application/json',
      Cookie: 'secret=1',
      'X-Forwarded-For': '1.2.3.4',
      Authorization: 'Bearer t',
      'Content-Type': 'application/json',
    });
    const filtered = filterRequestHeaders(source);
    expect(filtered.get('accept')).toBe('application/json');
    expect(filtered.get('authorization')).toBe('Bearer t');
    expect(filtered.get('content-type')).toBe('application/json');
    expect(filtered.get('cookie')).toBeNull();
    expect(filtered.get('x-forwarded-for')).toBeNull();
  });
});

describe('filterResponseHeaders', () => {
  it('drops set-cookie and CORS headers', () => {
    const source = new Headers({
      'Content-Type': 'application/json',
      'Set-Cookie': '__Host-ap_at=x',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    const filtered = filterResponseHeaders(source);
    expect(filtered.get('content-type')).toBe('application/json');
    expect(filtered.get('cache-control')).toBe('no-store');
    expect(filtered.get('set-cookie')).toBeNull();
    expect(filtered.get('access-control-allow-origin')).toBeNull();
  });
});

describe('injectTrustedClientIpHeaders', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('overwrites client IP and sets BFF secret when configured', () => {
    vi.stubEnv('AUTH_BFF_SHARED_SECRET', 'compose-shared-secret');
    const request = new NextRequest(
      'http://localhost/api/proxy/api/v1/search',
      {
        headers: { 'x-forwarded-for': '203.0.113.44, 10.0.0.1' },
      },
    );
    const headers = filterRequestHeaders(
      new Headers({
        Accept: 'application/json',
        'X-Aperture-Client-IP': 'spoofed',
        'X-Aperture-BFF-Secret': 'spoofed-secret',
      }),
    );
    injectTrustedClientIpHeaders(request, headers);
    expect(headers.get('X-Aperture-Client-IP')).toBe('203.0.113.44');
    expect(headers.get('X-Aperture-BFF-Secret')).toBe('compose-shared-secret');
    expect(clientIpFromRequest(request)).toBe('203.0.113.44');
  });

  it('deletes trusted headers when IP and secret are absent', () => {
    vi.stubEnv('AUTH_BFF_SHARED_SECRET', '');
    const request = new NextRequest('http://localhost/api/proxy/api/v1/search');
    const headers = new Headers({
      'X-Aperture-Client-IP': 'spoofed',
      'X-Aperture-BFF-Secret': 'spoofed-secret',
    });
    injectTrustedClientIpHeaders(request, headers);
    expect(headers.get('X-Aperture-Client-IP')).toBeNull();
    expect(headers.get('X-Aperture-BFF-Secret')).toBeNull();
  });
});
