/**
 * Client helper for BFF-gated username availability (ADR-0018).
 */

export type UsernameAvailabilityStatus =
  'available' | 'taken' | 'invalid' | 'checking' | 'idle' | 'error';

export interface UsernameAvailabilityResult {
  status: 'available' | 'taken' | 'invalid';
}

export function usernameAvailabilityCopy(
  status: UsernameAvailabilityStatus,
): string | null {
  switch (status) {
    case 'checking':
      return 'Checking username.';
    case 'available':
      return 'Username is available.';
    case 'taken':
      return 'This username is unavailable.';
    case 'invalid':
      // Format failures keep the criteria hint in the form. Do not call
      // a bad shape "unavailable" (that word is for an existing account).
      return null;
    case 'error':
      return 'Could not check username.';
    default:
      return null;
  }
}

/**
 * Call the same-origin BFF. Guests and signed-in rename share this path.
 */
export async function fetchUsernameAvailability(
  username: string,
  signal?: AbortSignal,
): Promise<UsernameAvailabilityResult> {
  const params = new URLSearchParams({ username });
  const res = await fetch(
    `/api/auth/username-availability?${params.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
      signal,
    },
  );
  if (res.status === 429) {
    throw new Error('rate_limited');
  }
  if (!res.ok) {
    throw new Error(`http_${res.status}`);
  }
  const data: unknown = await res.json().catch(() => null);
  if (
    typeof data === 'object' &&
    data !== null &&
    'status' in data &&
    (data.status === 'available' ||
      data.status === 'taken' ||
      data.status === 'invalid')
  ) {
    return { status: data.status };
  }
  throw new Error('invalid_body');
}
