import {
  applyAuthCookies,
  clearAuthCookies,
  forwardAuthJson,
  jsonError,
  parseTokenPayload,
} from '@/lib/auth-bff';
import { accessCookieName, refreshCookieName } from '@/lib/auth-cookies';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function fetchMe(
  request: NextRequest,
  accessToken: string,
): Promise<Response> {
  return forwardAuthJson(request, '/api/v1/auth/me', {
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
      upstream = await fetchMe(request, accessToken);
    } catch {
      return jsonError('Upstream API unreachable', 502);
    }
  }

  if ((upstream === null || upstream.status === 401) && refreshToken) {
    try {
      const refreshRes = await forwardAuthJson(request, '/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const refreshData: unknown = await refreshRes.json().catch(() => null);
      if (!refreshRes.ok) {
        // Forward 429 (and other non-401 failures) without clearing cookies.
        const status = refreshRes.status === 429 ? 429 : 401;
        const response = NextResponse.json(
          refreshData ?? {
            detail:
              status === 429
                ? 'Too many attempts. Try again later.'
                : 'Not authenticated',
          },
          { status },
        );
        if (refreshRes.status === 401) {
          clearAuthCookies(response);
        }
        return response;
      }
      refreshedTokens = parseTokenPayload(refreshData);
      if (refreshedTokens === null) {
        return jsonError('Invalid token response from API', 502);
      }
      accessToken = refreshedTokens.access_token;
      upstream = await fetchMe(request, accessToken);
    } catch {
      return jsonError('Upstream API unreachable', 502);
    }
  }

  if (upstream === null) {
    return jsonError('Not authenticated', 401);
  }

  const data: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const response = NextResponse.json(data ?? { detail: 'Not authenticated' }, {
      status: upstream.status,
    });
    if (upstream.status === 401) {
      clearAuthCookies(response);
    }
    return response;
  }

  const response = NextResponse.json(data);
  if (refreshedTokens !== null) {
    applyAuthCookies(response, refreshedTokens);
  }
  return response;
}
