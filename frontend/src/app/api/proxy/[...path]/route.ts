import { upstreamApiBaseUrl } from '@/lib/api';
import { accessCookieName } from '@/lib/auth-cookies';
import {
  UPSTREAM_FETCH_TIMEOUT_MS,
  buildUpstreamUrl,
  filterRequestHeaders,
  filterResponseHeaders,
  isDeniedProxyPath,
} from '@/lib/bff-proxy';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function proxyRequest(
  request: NextRequest,
  pathParts: string[],
): Promise<NextResponse> {
  if (isDeniedProxyPath(pathParts)) {
    return NextResponse.json({ detail: 'Not found' }, { status: 404 });
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

  const upstreamUrl = buildUpstreamUrl(base, pathParts, request.nextUrl.search);
  if (upstreamUrl === null) {
    return NextResponse.json({ detail: 'Invalid proxy path' }, { status: 400 });
  }

  const headers = filterRequestHeaders(request.headers);
  // Inject Bearer from HttpOnly access cookie when the browser did not send one.
  if (!headers.has('authorization')) {
    const accessToken = request.cookies.get(accessCookieName())?.value;
    if (accessToken) {
      headers.set('authorization', `Bearer ${accessToken}`);
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (error: unknown) {
    const timedOut =
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name: string }).name === 'TimeoutError';
    return NextResponse.json(
      {
        detail: timedOut ? 'Upstream API timeout' : 'Upstream API unreachable',
      },
      { status: timedOut ? 504 : 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: filterResponseHeaders(upstream.headers),
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
