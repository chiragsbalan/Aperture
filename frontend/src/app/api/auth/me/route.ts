import {
  applyAuthCookies,
  forwardAuthJson,
  jsonError,
  parseTokenPayload,
} from '@/lib/auth-bff';
import { accessCookieName, refreshCookieName } from '@/lib/auth-cookies';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function fetchMe(accessToken: string): Promise<Response> {
  return forwardAuthJson('/api/v1/auth/me', {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let accessToken = request.cookies.get(accessCookieName())?.value;
  const refreshToken = request.cookies.get(refreshCookieName())?.value;

  if (!accessToken && !refreshToken) {
    return jsonError('Not authenticated', 401);
  }

  let upstream: Response | null = null;
  let refreshedTokens: ReturnType<typeof parseTokenPayload> = null;

  if (accessToken) {
    try {
      upstream = await fetchMe(accessToken);
    } catch {
      return jsonError('Upstream API unreachable', 502);
    }
  }

  if ((upstream === null || upstream.status === 401) && refreshToken) {
    try {
      const refreshRes = await forwardAuthJson('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const refreshData: unknown = await refreshRes.json().catch(() => null);
      if (!refreshRes.ok) {
        // Do not clear cookies on refresh 401 — multi-tab rotation race;
        // 10s grace + singleflight deferred to P1.2.
        return NextResponse.json(
          refreshData ?? { detail: 'Not authenticated' },
          { status: 401 },
        );
      }
      refreshedTokens = parseTokenPayload(refreshData);
      if (refreshedTokens === null) {
        return jsonError('Invalid token response from API', 502);
      }
      accessToken = refreshedTokens.access_token;
      upstream = await fetchMe(accessToken);
    } catch {
      return jsonError('Upstream API unreachable', 502);
    }
  }

  if (upstream === null) {
    return jsonError('Not authenticated', 401);
  }

  const data: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    // Do not clear cookies on /me 401 — same multi-tab race as refresh.
    return NextResponse.json(data ?? { detail: 'Not authenticated' }, {
      status: upstream.status,
    });
  }

  const response = NextResponse.json(data);
  if (refreshedTokens !== null) {
    applyAuthCookies(response, refreshedTokens);
  }
  return response;
}
