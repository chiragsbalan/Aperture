/**
 * Google OAuth helpers for the Next.js BFF (PKCE + code exchange).
 *
 * Browser never sees client secret. Mock mode (`AUTH_GOOGLE_MOCK=true`) skips
 * the real Google authorize/token endpoints for local/CI only — never production.
 */

import { createHash, randomBytes } from 'node:crypto';

import { createRemoteJWKSet, jwtVerify } from 'jose';

export const OAUTH_STATE_COOKIE = 'ap_oauth_state';
export const OAUTH_VERIFIER_COOKIE = 'ap_oauth_verifier';
export const OAUTH_INTENT_COOKIE = 'ap_oauth_intent';

export type GoogleOAuthIntent = 'sign_in' | 'link';

export interface GoogleProfile {
  sub: string;
  email: string;
  given_name: string | null;
  family_name: string | null;
}

const OAUTH_COOKIE_MAX_AGE_SECONDS = 600;
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

/**
 * Real hosted production (Vercel). Compose/`next start` also sets
 * NODE_ENV=production locally — do not treat that as a prod deploy ban for mock.
 */
function isProductionDeploy(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

export function oauthCookieOptions(
  maxAgeSeconds = OAUTH_COOKIE_MAX_AGE_SECONDS,
): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function clearOauthCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return oauthCookieOptions(0);
}

/** True only when mock is requested and this is not a Vercel production deploy. */
export function isGoogleMockEnabled(): boolean {
  if (isProductionDeploy()) {
    return false;
  }
  return (process.env.AUTH_GOOGLE_MOCK ?? '').toLowerCase() === 'true';
}

/**
 * Reject Vercel production deploys that still set AUTH_GOOGLE_MOCK=true.
 */
export function assertGoogleMockNotForcedInProduction(): void {
  const wantsMock =
    (process.env.AUTH_GOOGLE_MOCK ?? '').toLowerCase() === 'true';
  if (wantsMock && isProductionDeploy()) {
    throw new Error('AUTH_GOOGLE_MOCK=true is forbidden in production');
  }
}

export function parseOAuthIntent(raw: string | null): GoogleOAuthIntent {
  return raw === 'link' ? 'link' : 'sign_in';
}

/** RFC 7636 code_verifier (43–128 chars from unreserved set). */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function generateOAuthState(): string {
  return randomBytes(24).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function googleAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

/** Verify Google id_token (JWKS signature, aud, iss, email_verified). */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<GoogleProfile> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
  });
  const sub = payload.sub;
  const email = payload.email;
  if (typeof sub !== 'string' || !sub || typeof email !== 'string' || !email) {
    throw new Error('Google id_token missing sub/email');
  }
  if (payload.email_verified !== true) {
    throw new Error('Google email is not verified');
  }
  return {
    sub,
    email,
    given_name:
      typeof payload.given_name === 'string' ? payload.given_name : null,
    family_name:
      typeof payload.family_name === 'string' ? payload.family_name : null,
  };
}

/** Deterministic mock profile for local/CI (`code` may carry email hints). */
export function mockGoogleProfile(code: string): GoogleProfile {
  const safe = code.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'mock';
  return {
    sub: `mock-google-sub-${safe}`,
    email: `mock-${safe.toLowerCase()}@example.com`,
    given_name: 'Mock',
    family_name: 'User',
  };
}

/**
 * Exchange an authorization code for a Google profile.
 *
 * In mock mode, returns {@link mockGoogleProfile} without calling Google.
 */
export async function exchangeCode(
  code: string,
  verifier: string,
): Promise<GoogleProfile> {
  assertGoogleMockNotForcedInProduction();
  if (isGoogleMockEnabled()) {
    if (!verifier) {
      throw new Error('Missing PKCE verifier');
    }
    return mockGoogleProfile(code);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? '';
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth is not configured');
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed (${tokenRes.status})`);
  }
  const data = (await tokenRes.json()) as { id_token?: string };
  if (typeof data.id_token !== 'string' || !data.id_token) {
    throw new Error('Google token response missing id_token');
  }
  return verifyGoogleIdToken(data.id_token, clientId);
}
