import { clearAuthCookies, forwardAuthJson, jsonError } from '@/lib/auth-bff';
import { refreshCookieName } from '@/lib/auth-cookies';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(refreshCookieName())?.value;

  if (refreshToken) {
    try {
      await forwardAuthJson(request, '/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // Still clear cookies if upstream is unreachable.
    }
  }

  const response = new NextResponse(null, { status: 204 });
  clearAuthCookies(response);
  return response;
}

export async function GET(): Promise<NextResponse> {
  return jsonError('Method not allowed', 405);
}
