import { NextResponse } from 'next/server';

import { upstreamApiBaseUrl } from '@/lib/api';
import {
  applyTrustedClientIpHeaders,
  clientIpFromForwardedFor,
} from '@/lib/trusted-client-headers';

const RESOLVE_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 1024;

interface ResolveBody {
  tmdb_id?: unknown;
  type?: unknown;
}

/**
 * Intentional catalog warm for Top movies / Similar hover+focus prefetch.
 * Browser must not hit movies/tv resolve via the generic BFF proxy.
 */
export async function POST(request: Request): Promise<Response> {
  const bodyText = await readBodyLimited(request, MAX_BODY_BYTES);
  if (bodyText === null) {
    return NextResponse.json(
      { error: 'Request body too large' },
      { status: 413 },
    );
  }

  let body: ResolveBody;
  try {
    body = JSON.parse(bodyText) as ResolveBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const tmdbId = body.tmdb_id;
  if (typeof tmdbId !== 'number' || !Number.isInteger(tmdbId) || tmdbId <= 0) {
    return NextResponse.json({ error: 'Invalid tmdb_id' }, { status: 400 });
  }

  const kind = body.type === 'tv' || body.type === 'tv_show' ? 'tv' : 'movie';
  const path = kind === 'tv' ? '/api/v1/tv/resolve' : '/api/v1/movies/resolve';

  const clientIp = warmClientIp(request);
  if (clientIp == null) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let base: string;
  try {
    base = upstreamApiBaseUrl();
  } catch {
    return NextResponse.json(
      { error: 'API_URL is not configured' },
      { status: 503 },
    );
  }

  const headers = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });
  applyTrustedClientIpHeaders(headers, clientIp);

  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      cache: 'no-store',
      headers,
      body: JSON.stringify({ tmdb_id: tmdbId }),
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.text().catch(() => undefined);
      const status =
        res.status === 404 || res.status === 429 || res.status === 503
          ? res.status
          : 502;
      return NextResponse.json(
        { error: `Upstream error (HTTP ${res.status})` },
        { status },
      );
    }
    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Catalog resolve failed' },
      { status: 502 },
    );
  }
}

/**
 * First hop of `x-forwarded-for`, else `x-real-ip`.
 * Production without a client IP returns null (caller responds 429).
 * Non-production falls back to loopback for local DX.
 */
function warmClientIp(request: Request): string | null {
  const fromXff = clientIpFromForwardedFor(
    request.headers.get('x-forwarded-for'),
  );
  if (fromXff) {
    return fromXff;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp.slice(0, 64);
  }
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  return '127.0.0.1';
}

/**
 * Read the request body with a hard byte cap.
 * Returns null when Content-Length or streamed bytes exceed `maxBytes`.
 */
async function readBodyLimited(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader != null && contentLengthHeader !== '') {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return null;
    }
  }

  const body = request.body;
  if (body == null) {
    return '';
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value == null) {
      continue;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
