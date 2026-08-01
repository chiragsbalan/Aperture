import {
  applyAuthCookies,
  forwardAuthJson,
  jsonError,
  parseTokenPayload,
  readJsonBody,
} from '@/lib/auth-bff';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError('Invalid JSON body', 400);
  }

  let upstream: Response;
  try {
    upstream = await forwardAuthJson('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return jsonError('Upstream API unreachable', 502);
  }

  const data: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return NextResponse.json(data ?? { detail: 'Login failed' }, {
      status: upstream.status,
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
