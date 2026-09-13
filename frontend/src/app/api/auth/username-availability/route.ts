import {
  UPSTREAM_FETCH_TIMEOUT_MS,
  injectTrustedClientIpHeaders,
} from '@/lib/bff-proxy';
import { accessCookieName } from '@/lib/auth-cookies';
import { upstreamApiBaseUrl } from '@/lib/api';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function isObviousCrossSite(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    return false;
  }
  try {
    return new URL(origin).origin !== request.nextUrl.origin;
  } catch {
    return true;
  }
}

/**
 * Same-origin BFF for username live availability (ADR-0018).
 * Forwards BFF secret + trusted client IP; never exposes the API probe.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isObviousCrossSite(request)) {
    return NextResponse.json({ detail: 'Forbidden' }, { status: 403 });
  }

  const username = request.nextUrl.searchParams.get('username');
  if (username === null || username.trim() === '') {
    return NextResponse.json(
      { status: 'invalid' } satisfies { status: 'invalid' },
      { status: 200 },
    );
  }

  let base: string;
  try {
    base = upstreamApiBaseUrl();
  } catch {
    return NextResponse.json(
      { detail: 'API_URL is not configured' },
      { status: 500 },
    );
  }

  const upstreamUrl = new URL(`${base}/api/v1/users/username-availability`);
  upstreamUrl.searchParams.set('username', username);

  const headers = new Headers();
  injectTrustedClientIpHeaders(request, headers);
  const accessToken = request.cookies.get(accessCookieName())?.value;
  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json(
      { detail: 'Upstream API unreachable' },
      { status: 502 },
    );
  }

  const data: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return NextResponse.json(data ?? { detail: 'Availability check failed' }, {
      status: upstream.status,
    });
  }

  if (
    typeof data === 'object' &&
    data !== null &&
    'status' in data &&
    (data.status === 'available' ||
      data.status === 'taken' ||
      data.status === 'invalid')
  ) {
    return NextResponse.json(
      { status: data.status } satisfies {
        status: 'available' | 'taken' | 'invalid';
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    { detail: 'Invalid upstream response' },
    { status: 502 },
  );
}
