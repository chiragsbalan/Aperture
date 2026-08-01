/**
 * Client-safe Google OAuth error codes / messages (no Node builtins).
 */

/** Map API/BFF failures to short query-param codes for login/account UI. */
export function oauthErrorCode(detail: unknown, status: number): string {
  if (status === 409 && typeof detail === 'string') {
    const lower = detail.toLowerCase();
    if (lower.includes('already exists')) {
      return 'email_exists';
    }
    if (lower.includes('already linked to another')) {
      return 'google_taken';
    }
    if (lower.includes('already linked to this')) {
      return 'google_already_linked';
    }
  }
  if (status === 401) {
    return 'login_required';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  return 'oauth_failed';
}

export function oauthErrorMessage(
  code: string | null | undefined,
): string | null {
  if (!code) {
    return null;
  }
  switch (code) {
    case 'email_exists':
      return (
        'An account with this email already exists. ' +
        'Log in with your password, then link Google from Account.'
      );
    case 'google_taken':
      return 'This Google account is already linked to another user.';
    case 'google_already_linked':
      return 'Google is already linked to this account.';
    case 'login_required':
      return 'Log in before linking Google.';
    case 'rate_limited':
      return 'Too many attempts. Try again later.';
    case 'oauth_failed':
      return 'Google sign-in failed. Try again.';
    case 'missing_state':
      return 'Google sign-in expired. Try again.';
    case 'oauth_cancelled':
      return 'Google sign-in was cancelled.';
    default:
      return 'Google sign-in failed. Try again.';
  }
}
