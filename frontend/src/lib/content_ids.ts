/**
 * @fileoverview Helpers for catalog route params (UUID vs TMDb slug).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a canonical content UUID. */
export function isContentUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Parse a TMDb id from a bare number (`155`) or slug (`155-the-dark-knight`).
 * Returns null for UUIDs and non-numeric paths.
 */
export function parseTmdbIdParam(value: string): number | null {
  if (isContentUuid(value)) {
    return null;
  }
  const match = /^(\d+)(?:-[\w-]+)?$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  const id = Number(match[1]);
  if (!Number.isInteger(id) || id <= 0 || id > Number.MAX_SAFE_INTEGER) {
    return null;
  }
  return id;
}
