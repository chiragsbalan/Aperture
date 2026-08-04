import { upstreamApiBaseUrl } from '@/lib/api';
import {
  applyAuthCookies,
  clearAuthCookies,
  forwardAuthJson,
  parseTokenPayload,
  type TokenPayload,
} from '@/lib/auth-bff';
import { accessCookieName, refreshCookieName } from '@/lib/auth-cookies';
import {
  UPSTREAM_FETCH_TIMEOUT_MS,
  buildUpstreamUrl,
  filterRequestHeaders,
  filterResponseHeaders,
  injectTrustedClientIpHeaders,
  isDeniedProxyPath,
} from '@/lib/bff-proxy';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RefreshOutcome =
  | { ok: true; tokens: TokenPayload }
  | { ok: false; status: number; data: unknown };

/** In-flight refresh singleflight keyed by refresh token (module scope). */
const refreshFlights = new Map<string, Promise<RefreshOutcome>>();

async function refreshSessionTokens(
  request: NextRequest,
  refreshToken: string,
): Promise<RefreshOutcome> {
  const existing = refreshFlights.get(refreshToken);
  if (existing != null) {
    return existing;
  }

  const flight = (async (): Promise<RefreshOutcome> => {
    try {
      const refreshRes = await forwardAuthJson(
        request,
        '/api/v1/auth/refresh',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
      );
      const refreshData: unknown = await refreshRes.json().catch(() => null);
      if (!refreshRes.ok) {
        return {
          ok: false,
          status: refreshRes.status === 429 ? 429 : 401,
          data: refreshData ?? { detail: 'Not authenticated' },
        };
      }
      const tokens = parseTokenPayload(refreshData);
      if (tokens === null) {
        return {
          ok: false,
          status: 502,
          data: { detail: 'Invalid token response from API' },
        };
      }
      return { ok: true, tokens };
    } finally {
      refreshFlights.delete(refreshToken);
    }
  })();

  refreshFlights.set(refreshToken, flight);
  return flight;
}

function upstreamFetchErrorResponse(error: unknown): NextResponse {
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

function passThroughUpstream(upstream: Response): NextResponse {
  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: filterResponseHeaders(upstream.headers),
  });
}

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
  injectTrustedClientIpHeaders(request, headers);
  // Inject Bearer from HttpOnly access cookie when the browser did not send one.
  const hadBrowserAuthorization = headers.has('authorization');
  if (!hadBrowserAuthorization) {
    const accessToken = request.cookies.get(accessCookieName())?.value;
    if (accessToken) {
      headers.set('authorization', `Bearer ${accessToken}`);
    }
  }

  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
  };
  if (body !== undefined) {
    init.body = body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (error: unknown) {
    return upstreamFetchErrorResponse(error);
  }

  // Cookie-session requests: on expired access token, refresh once and retry
  // (same behavior as `/api/auth/me`). Skip when the browser sent its own Bearer.
  // Concurrent 401s share one refresh flight per refresh token; each waiter still
  // retries its own upstream request (including mutates). Residual risk: after a
  // shared refresh, non-idempotent POSTs/PATCHs that each saw 401 may double-submit.
  const refreshToken = request.cookies.get(refreshCookieName())?.value;
  if (
    upstream.status === 401 &&
    !hadBrowserAuthorization &&
    refreshToken != null &&
    refreshToken !== ''
  ) {
    try {
      const outcome = await refreshSessionTokens(request, refreshToken);
      if (!outcome.ok) {
        if (outcome.status === 502) {
          return NextResponse.json(outcome.data, { status: 502 });
        }
        const status = outcome.status === 429 ? 429 : 401;
        const response = NextResponse.json(outcome.data, { status });
        if (status === 401) {
          clearAuthCookies(response);
        }
        return response;
      }

      const retryHeaders = filterRequestHeaders(request.headers);
      injectTrustedClientIpHeaders(request, retryHeaders);
      retryHeaders.set(
        'authorization',
        `Bearer ${outcome.tokens.access_token}`,
      );
      const retryInit: RequestInit = {
        method: request.method,
        headers: retryHeaders,
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
      };
      if (body !== undefined) {
        retryInit.body = body;
      }
      upstream = await fetch(upstreamUrl, retryInit);
      const response = passThroughUpstream(upstream);
      applyAuthCookies(response, outcome.tokens);
      return response;
    } catch (error: unknown) {
      return upstreamFetchErrorResponse(error);
    }
  }

  return passThroughUpstream(upstream);
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
