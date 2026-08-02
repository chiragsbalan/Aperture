import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

describe('POST /api/catalog/resolve', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('API_URL', 'http://upstream.test');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects invalid JSON body', async () => {
    const res = await POST(
      new Request('http://localhost/api/catalog/resolve', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        body: '{not-json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 429 when client IP is missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const res = await POST(
      new Request('http://localhost/api/catalog/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tmdb_id: 42, type: 'movie' }),
      }),
    );

    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 413 when body exceeds 1KB', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    const oversized = JSON.stringify({
      tmdb_id: 42,
      type: 'movie',
      pad: 'x'.repeat(1200),
    });
    expect(new TextEncoder().encode(oversized).byteLength).toBeGreaterThan(
      1024,
    );

    const res = await POST(
      new Request('http://localhost/api/catalog/resolve', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        body: oversized,
      }),
    );

    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passthrough upstream 429', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ detail: 'slow down' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const res = await POST(
      new Request('http://localhost/api/catalog/resolve', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({ tmdb_id: 42, type: 'movie' }),
      }),
    );

    expect(res.status).toBe(429);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
