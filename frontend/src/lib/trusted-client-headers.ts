/**
 * Trusted BFF → API client-IP headers (shared by proxy routes and RSC fetch).
 */

/** First hop from an `x-forwarded-for` header value, else null (max 64 chars). */
export function clientIpFromForwardedFor(
  forwarded: string | null,
): string | null {
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first.slice(0, 64);
    }
  }
  return null;
}

/**
 * Set or clear trusted BFF client-IP headers on an upstream request.
 *
 * Sets `X-Aperture-Client-IP` when `clientIp` is present and
 * `X-Aperture-BFF-Secret` from `AUTH_BFF_SHARED_SECRET` when non-empty.
 */
export function applyTrustedClientIpHeaders(
  headers: Headers,
  clientIp: string | null,
): void {
  if (clientIp) {
    headers.set('X-Aperture-Client-IP', clientIp);
  } else {
    headers.delete('X-Aperture-Client-IP');
  }
  const secret = process.env.AUTH_BFF_SHARED_SECRET ?? '';
  if (secret) {
    headers.set('X-Aperture-BFF-Secret', secret);
  } else {
    headers.delete('X-Aperture-BFF-Secret');
  }
}
