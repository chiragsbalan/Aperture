/**
 * @fileoverview Display helpers for TV series status labels.
 */

/** TMDb ``Ended`` → product copy ``Finished`` (other statuses unchanged). */
export function formatTvStatusLabel(
  status: string | null | undefined,
): string | null {
  const trimmed = status?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.toLowerCase() === 'ended') {
    return 'Finished';
  }
  return trimmed;
}
