import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertGoogleMockNotForcedInProduction,
  exchangeCode,
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
  googleAuthorizeUrl,
  isGoogleMockEnabled,
  mockGoogleProfile,
  parseOAuthIntent,
} from './google-oauth';
import { oauthErrorCode, oauthErrorMessage } from './google-oauth-errors';

describe('google-oauth helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('generates verifier and matching S256 challenge', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    const challenge = generateCodeChallenge(verifier);
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
  });

  it('generates opaque state', () => {
    const state = generateOAuthState();
    expect(state.length).toBeGreaterThan(10);
  });

  it('parses intent', () => {
    expect(parseOAuthIntent('link')).toBe('link');
    expect(parseOAuthIntent('sign_in')).toBe('sign_in');
    expect(parseOAuthIntent(null)).toBe('sign_in');
  });

  it('builds Google authorize URL with PKCE params', () => {
    const url = googleAuthorizeUrl({
      clientId: 'cid',
      redirectUri: 'http://localhost:3000/api/auth/google/callback',
      state: 'abc',
      codeChallenge: 'chal',
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://accounts.google.com');
    expect(parsed.searchParams.get('client_id')).toBe('cid');
    expect(parsed.searchParams.get('code_challenge')).toBe('chal');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('state')).toBe('abc');
  });

  it('mock profile is deterministic from code', () => {
    const profile = mockGoogleProfile('mock-xyz');
    expect(profile.sub).toContain('mock-google-sub-');
    expect(profile.email).toContain('@example.com');
    expect(profile.given_name).toBe('Mock');
    expect(profile.picture).toBeNull();
  });

  it('exchangeCode uses mock when AUTH_GOOGLE_MOCK=true', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('AUTH_GOOGLE_MOCK', 'true');
    expect(isGoogleMockEnabled()).toBe(true);
    const profile = await exchangeCode('mock-abc', 'verifier');
    expect(profile.sub).toContain('mock-abc');
  });

  it('refuses mock mode on Vercel production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('AUTH_GOOGLE_MOCK', 'true');
    expect(isGoogleMockEnabled()).toBe(false);
    expect(() => assertGoogleMockNotForcedInProduction()).toThrow(
      /forbidden in production/i,
    );
  });

  it('allows mock with NODE_ENV=production outside Vercel (Compose)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('AUTH_GOOGLE_MOCK', 'true');
    expect(isGoogleMockEnabled()).toBe(true);
    expect(() => assertGoogleMockNotForcedInProduction()).not.toThrow();
  });

  it('maps cancelled OAuth to a clear message', () => {
    expect(oauthErrorMessage('oauth_cancelled')).toContain('cancelled');
  });

  it('maps API conflict details to error codes', () => {
    expect(
      oauthErrorCode(
        'An account with this email already exists. Log in with your password, then link Google from Account.',
        409,
      ),
    ).toBe('email_exists');
    expect(
      oauthErrorCode(
        'This Google account is already linked to another user.',
        409,
      ),
    ).toBe('google_taken');
    expect(oauthErrorCode('nope', 401)).toBe('login_required');
  });

  it('maps error codes to user-facing messages', () => {
    expect(oauthErrorMessage('email_exists')).toContain('already exists');
    expect(oauthErrorMessage(null)).toBeNull();
  });
});
