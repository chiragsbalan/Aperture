/**
 * Reserved auth cookie names (ADR-0003 / PLAN).
 *
 * Same-origin BFF will set these in P1. Do not set or read them in P0.5.
 * `__Host-` prefix requires Secure, Path=/, no Domain attribute.
 */
export const ACCESS_TOKEN_COOKIE = '__Host-ap_at' as const;
export const REFRESH_TOKEN_COOKIE = '__Host-ap_rt' as const;
