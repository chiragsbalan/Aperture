/**
 * Pure helpers for the same-origin BFF proxy (`/api/proxy/...`).
 */

import { type NextRequest } from 'next/server';

export const UPSTREAM_FETCH_TIMEOUT_MS = 10_000;

/** Headers allowed from the browser → upstream API. */
export const REQUEST_HEADER_ALLOWLIST = new Set([
  'accept',
  'accept-language',
  'content-type',
  'authorization',
  'idempotency-key',
  'x-request-id',
  'x-correlation-id',
]);

/** Headers allowed from upstream API → browser. */
export const RESPONSE_HEADER_ALLOWLIST = new Set([
  'content-type',
  'cache-control',
  'etag',
  'last-modified',
  'vary',
  'x-request-id',
]);

export function normalizeUpstreamBase(raw: string): string {
  return raw.replace(/\/$/, '');
}

/**
 * Paths the generic BFF proxy must not forward. Auth tokens are only minted
 * via dedicated `/api/auth/*` routes.
 */
export function isDeniedProxyPath(pathParts: string[]): boolean {
  return (
    pathParts.length >= 3 &&
    pathParts[0] === 'api' &&
    pathParts[1] === 'v1' &&
    pathParts[2] === 'auth'
  );
}

/**
 * Build an upstream URL pinned to ``base``. Returns null when the path is
 * empty, traversal-like, or would escape the configured origin.
 */
export function buildUpstreamUrl(
  base: string,
  pathParts: string[],
  search: string,
): URL | null {
  if (pathParts.length === 0) {
    return null;
  }
  if (pathParts.some((part) => part === '..' || part.includes('\\'))) {
    return null;
  }

  const normalizedBase = normalizeUpstreamBase(base);
  let baseUrl: URL;
  try {
    baseUrl = new URL(normalizedBase);
  } catch {
    return null;
  }

  const path = pathParts.map(encodeURIComponent).join('/');
  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(`${normalizedBase}/${path}${search}`);
  } catch {
    return null;
  }

  if (upstreamUrl.origin !== baseUrl.origin) {
    return null;
  }

  return upstreamUrl;
}

export function filterRequestHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (REQUEST_HEADER_ALLOWLIST.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  // Defense in depth — never forward browser cookies to the cookie-agnostic API.
  headers.delete('cookie');
  return headers;
}

/** First hop from `x-forwarded-for`, else null (max 64 chars). */
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
 * Overwrite trusted BFF client-IP headers on an upstream request.
 *
 * Call after {@link filterRequestHeaders} so browser-supplied copies never
 * survive. Sets `X-Aperture-Client-IP` from the browser request IP and
 * `X-Aperture-BFF-Secret` from `AUTH_BFF_SHARED_SECRET` when non-empty.
 */
export function injectTrustedClientIpHeaders(
  request: NextRequest,
  headers: Headers,
): void {
  const clientIp = clientIpFromRequest(request);
  if (clientIp) {
    headers.set('X-Aperture-Client-IP', clientIp);
  } else {
    headers.delete('X-Aperture-Client-IP');
  }
  const secret = process.env.AUTH_BFF_SHARED_SECRET ?? '';
  if (secret) {
    headers.set('X-Aperture-BFF-Secret', secret);
  } else {
    headers.delete('X-Aperture-BFF-Secret');
  }
}

export function filterResponseHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (RESPONSE_HEADER_ALLOWLIST.has(lower)) {
      headers.set(key, value);
    }
  });
  return headers;
}
