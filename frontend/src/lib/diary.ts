import type { WatchEntry } from '@/lib/library';

export interface DiaryMonthGroup {
  key: string;
  label: string;
  entries: WatchEntry[];
}

/** Format `YYYY-MM` as a long month heading (UTC). */
export function formatDiaryMonthLabel(yearMonth: string): string {
  const [yearText, monthText] = yearMonth.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return yearMonth;
  }
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Day-of-month from an ISO date string (`YYYY-MM-DD`). */
export function formatDiaryDayLabel(isoDate: string): string {
  const day = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(day)) {
    return isoDate;
  }
  return String(day);
}

/**
 * Group diary entries by calendar month, preserving input order
 * (API returns newest-first).
 */
export function groupDiaryEntriesByMonth(
  entries: WatchEntry[],
): DiaryMonthGroup[] {
  const groups: DiaryMonthGroup[] = [];
  let current: DiaryMonthGroup | null = null;
  for (const entry of entries) {
    const key = entry.watched_at.slice(0, 7);
    if (current == null || current.key !== key) {
      current = {
        key,
        label: formatDiaryMonthLabel(key),
        entries: [],
      };
      groups.push(current);
    }
    current.entries.push(entry);
  }
  return groups;
}

/** Newest watched_at first; stable for equal dates via id. */
export function compareWatchEntriesNewestFirst(
  a: WatchEntry,
  b: WatchEntry,
): number {
  const byDate = b.watched_at.localeCompare(a.watched_at);
  if (byDate !== 0) {
    return byDate;
  }
  return b.id.localeCompare(a.id);
}
