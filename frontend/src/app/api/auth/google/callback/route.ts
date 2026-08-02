import {
  applyAuthCookies,
  forwardAuthJson,
  parseTokenPayload,
} from '@/lib/auth-bff';
import { accessCookieName } from '@/lib/auth-cookies';
import { oauthErrorCode } from '@/lib/google-oauth-errors';
import {
  clearOauthCookieOptions,
  exchangeCode,
  OAUTH_INTENT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  parseOAuthIntent,
} from '@/lib/google-oauth';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function absoluteUrl(request: NextRequest, path: string): URL {
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (host) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'http';
    return new URL(path, `${proto}://${host}`);
  }
  return new URL(path, request.nextUrl.origin);
}

function redirectWithError(
  request: NextRequest,
  error: string,
  intent: 'sign_in' | 'link',
): NextResponse {
  const path =
    intent === 'link' ? `/account?error=${error}` : `/login?error=${error}`;
  const response = NextResponse.redirect(absoluteUrl(request, path));
  const cleared = clearOauthCookieOptions();
  response.cookies.set(OAUTH_STATE_COOKIE, '', cleared);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, '', cleared);
  response.cookies.set(OAUTH_INTENT_COOKIE, '', cleared);
  return response;
}

function clearOauthCookies(response: NextResponse): void {
  const cleared = clearOauthCookieOptions();
  response.cookies.set(OAUTH_STATE_COOKIE, '', cleared);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, '', cleared);
  response.cookies.set(OAUTH_INTENT_COOKIE, '', cleared);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const intent = parseOAuthIntent(
    request.cookies.get(OAUTH_INTENT_COOKIE)?.value ?? null,
  );
  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError === 'access_denied') {
    return redirectWithError(request, 'oauth_cancelled', intent);
  }
  if (providerError) {
    return redirectWithError(request, 'oauth_failed', intent);
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const storedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;

  if (!code || !state || !storedState || !verifier || state !== storedState) {
    return redirectWithError(request, 'missing_state', intent);
  }

  let profile;
  try {
    profile = await exchangeCode(code, verifier);
  } catch {
    return redirectWithError(request, 'oauth_failed', intent);
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (intent === 'link') {
    const access = request.cookies.get(accessCookieName())?.value;
    if (!access) {
      return redirectWithError(request, 'login_required', intent);
    }
    headers.authorization = `Bearer ${access}`;
  }

  let upstream: Response;
  try {
    upstream = await forwardAuthJson(request, '/api/v1/auth/google', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sub: profile.sub,
        email: profile.email,
        given_name: profile.given_name,
        family_name: profile.family_name,
        intent,
      }),
    });
  } catch {
    return redirectWithError(request, 'oauth_failed', intent);
  }

  const data: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    let detail: unknown = null;
    if (typeof data === 'object' && data !== null && 'detail' in data) {
      detail = (data as { detail: unknown }).detail;
    }
    const error = oauthErrorCode(detail, upstream.status);
    return redirectWithError(request, error, intent);
  }

  const tokens = parseTokenPayload(data);
  if (tokens === null) {
    return redirectWithError(request, 'oauth_failed', intent);
  }

  const successPath = intent === 'link' ? '/account' : '/';
  const response = NextResponse.redirect(absoluteUrl(request, successPath));
  applyAuthCookies(response, tokens);
  clearOauthCookies(response);
  return response;
}
