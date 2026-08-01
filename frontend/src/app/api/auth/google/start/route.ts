import { accessCookieName } from '@/lib/auth-cookies';
import {
  assertGoogleMockNotForcedInProduction,
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
  googleAuthorizeUrl,
  isGoogleMockEnabled,
  OAUTH_INTENT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  oauthCookieOptions,
  parseOAuthIntent,
} from '@/lib/google-oauth';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function absoluteUrl(request: NextRequest, path: string): URL {
  // Prefer Host from the browser (Compose may listen on 0.0.0.0).
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (host) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'http';
    return new URL(path, `${proto}://${host}`);
  }
  return new URL(path, request.nextUrl.origin);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    assertGoogleMockNotForcedInProduction();
  } catch {
    return NextResponse.redirect(
      absoluteUrl(request, '/login?error=oauth_failed'),
    );
  }

  const intent = parseOAuthIntent(request.nextUrl.searchParams.get('intent'));

  if (intent === 'link') {
    const access = request.cookies.get(accessCookieName())?.value;
    if (!access) {
      return NextResponse.redirect(
        absoluteUrl(request, '/login?error=login_required'),
      );
    }
  }

  const state = generateOAuthState();
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const cookieOpts = oauthCookieOptions();

  let redirectTarget: string;
  if (isGoogleMockEnabled()) {
    const callback = absoluteUrl(request, '/api/auth/google/callback');
    callback.searchParams.set('code', `mock-${state.slice(0, 12)}`);
    callback.searchParams.set('state', state);
    redirectTarget = callback.toString();
  } else {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? '';
    if (!clientId || !redirectUri) {
      return NextResponse.redirect(
        absoluteUrl(request, '/login?error=oauth_failed'),
      );
    }
    redirectTarget = googleAuthorizeUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge: challenge,
    });
  }

  const response = NextResponse.redirect(redirectTarget);
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOpts);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, cookieOpts);
  response.cookies.set(OAUTH_INTENT_COOKIE, intent, cookieOpts);
  return response;
}
