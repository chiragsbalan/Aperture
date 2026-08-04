/**
 * @fileoverview Return-path helpers for custom list detail navigation.
 */

/** Build a list detail href that remembers where the user opened it from. */
export function listDetailHref(listId: string, fromPath: string): string {
  const params = new URLSearchParams({ from: fromPath });
  return `/lists/${listId}?${params.toString()}`;
}

/** True when `from` is a same-origin in-app path safe for redirect. */
export function isSafeListReturnPath(path: string | null): path is string {
  if (path == null || path === '') {
    return false;
  }
  return path.startsWith('/') && !path.startsWith('//');
}
