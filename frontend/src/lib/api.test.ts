import { describe, expect, it, vi } from 'vitest';

import { fetchApiHealthViaBff } from './api';

describe('fetchApiHealthViaBff', () => {
  it('returns ready when both proxy calls succeed', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/health/ready')) {
        return new Response(JSON.stringify({ status: 'ready' }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          name: 'Aperture',
          version: '0.1.0',
          environment: 'local',
        }),
        { status: 200 },
      );
    });

    const health = await fetchApiHealthViaBff(fetchImpl as typeof fetch);
    expect(health.ready).toBe(true);
    expect(health.version?.version).toBe('0.1.0');
    expect(health.error).toBeNull();
  });

  it('returns not ready when readiness fails', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/health/ready')) {
        return new Response('nope', { status: 503 });
      }
      return new Response(
        JSON.stringify({
          name: 'Aperture',
          version: '0.1.0',
          environment: 'local',
        }),
        { status: 200 },
      );
    });

    const health = await fetchApiHealthViaBff(fetchImpl as typeof fetch);
    expect(health.ready).toBe(false);
    expect(health.error).toContain('503');
  });

  it('handles network failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const health = await fetchApiHealthViaBff(fetchImpl as typeof fetch);
    expect(health.ready).toBe(false);
    expect(health.error).toBe('Failed to reach API via BFF');
  });
});
