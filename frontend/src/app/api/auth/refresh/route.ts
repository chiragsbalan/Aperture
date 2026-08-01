import {
  applyAuthCookies,
  clearAuthCookies,
  forwardAuthJson,
  jsonError,
  parseTokenPayload,
} from '@/lib/auth-bff';
import { refreshCookieName } from '@/lib/auth-cookies';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(refreshCookieName())?.value;
  if (!refreshToken) {
    const response = jsonError('Not authenticated', 401);
    clearAuthCookies(response);
    return response;
  }

  let upstream: Response;
  try {
    upstream = await forwardAuthJson('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return jsonError('Upstream API unreachable', 502);
  }

  const data: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    // Do not clear cookies on refresh 401 — concurrent tabs may race; the
    // loser must not wipe the winner's rotated cookies. 10s grace +
    // singleflight deferred to P1.2.
    return NextResponse.json(data ?? { detail: 'Refresh failed' }, {
      status: upstream.status === 401 ? 401 : upstream.status,
    });
  }

  const tokens = parseTokenPayload(data);
  if (tokens === null) {
    return jsonError('Invalid token response from API', 502);
  }

  const response = NextResponse.json({
    status: 'ok',
    expires_in: tokens.expires_in,
  });
  applyAuthCookies(response, tokens);
  return response;
}
