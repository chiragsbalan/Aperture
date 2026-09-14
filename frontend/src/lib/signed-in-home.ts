/**
 * @fileoverview Internal rewrite target for the signed-in home shell.
 *
 * Anonymous ``/`` is cached. A session cookie rewrites to this path so the
 * personalized shell is never stored on that public cache.
 */

export const SIGNED_IN_HOME_PATH = '/internal/signed-in-home';

/** Set by middleware on the rewrite. A direct visit without it redirects. */
export const SIGNED_IN_HOME_HEADER = 'x-aperture-signed-in-home';
