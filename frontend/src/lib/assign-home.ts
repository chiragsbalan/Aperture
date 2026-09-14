/**
 * Full document load of ``/``.
 *
 * Login and logout must not use the client router cache. Anonymous ``/`` and
 * the signed-in rewrite are different documents at the same URL.
 */
export function assignHomeDocument(): void {
  window.location.assign('/');
}
