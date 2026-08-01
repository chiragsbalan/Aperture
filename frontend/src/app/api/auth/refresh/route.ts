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
    upstream = await forwardAuthJson(request, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return jsonError('Upstream API unreachable', 502);
  }

  const data: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    // Clear cookies only on 401. Keep them on 429/5xx so the client can retry.
    const response = NextResponse.json(data ?? { detail: 'Refresh failed' }, {
      status: upstream.status,
    });
    if (upstream.status === 401) {
      clearAuthCookies(response);
    }
    return response;
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
