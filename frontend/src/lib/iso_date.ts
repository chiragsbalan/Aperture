/**
 * Calendar-date helpers for `YYYY-MM-DD` (no time / timezone offset).
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CalendarParts {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

/** Local calendar today as `YYYY-MM-DD`. */
export function localTodayIsoDate(): string {
  return formatIsoDate(toCalendarParts(new Date()));
}

/** Parse a `YYYY-MM-DD` string; null if invalid. */
export function parseIsoDate(iso: string): CalendarParts | null {
  const match = ISO_DATE.exec(iso);
  if (match == null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function formatIsoDate(parts: CalendarParts): string {
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

function toCalendarParts(date: Date): CalendarParts {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

/** Display label for a diary / form date (`4 Aug 2026`). */
export function formatIsoDateLabel(iso: string): string {
  const parts = parseIsoDate(iso);
  if (parts == null) {
    return iso;
  }
  const date = new Date(parts.year, parts.month - 1, parts.day);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Month heading (`August 2026`). */
export function formatMonthYearLabel(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Sunday = 0 … Saturday = 6 for the 1st of the month. */
export function firstWeekdaySunday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  };
}
