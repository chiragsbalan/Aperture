'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import {
  daysInMonth,
  firstWeekdaySunday,
  formatIsoDate,
  formatIsoDateLabel,
  formatMonthYearLabel,
  localTodayIsoDate,
  parseIsoDate,
  shiftMonth,
  type CalendarParts,
} from '@/lib/iso_date';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

interface DayCell {
  iso: string;
  day: number;
  outside: boolean;
}

function buildMonthCells(year: number, month: number): DayCell[] {
  const leading = firstWeekdaySunday(year, month);
  const count = daysInMonth(year, month);
  const cells: DayCell[] = [];

  if (leading > 0) {
    const prev = shiftMonth(year, month, -1);
    const prevCount = daysInMonth(prev.year, prev.month);
    for (let i = leading - 1; i >= 0; i -= 1) {
      const day = prevCount - i;
      cells.push({
        iso: formatIsoDate({ year: prev.year, month: prev.month, day }),
        day,
        outside: true,
      });
    }
  }

  for (let day = 1; day <= count; day += 1) {
    cells.push({
      iso: formatIsoDate({ year, month, day }),
      day,
      outside: false,
    });
  }

  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const next = shiftMonth(year, month, 1);
    cells.push({
      iso: formatIsoDate({ year: next.year, month: next.month, day: nextDay }),
      day: nextDay,
      outside: true,
    });
    nextDay += 1;
  }

  return cells;
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3.5v3.5M16 3.5v3.5M3.5 10.5h17" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: 'prev' | 'next' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {direction === 'prev' ? (
        <path d="M15 18l-6-6 6-6" />
      ) : (
        <path d="M9 18l6-6-6-6" />
      )}
    </svg>
  );
}

/**
 * Custom date field — trigger matches form chrome; panel uses
 * `.overlay-surface` (same language as FormSelect / CollectionSheet).
 */
export function FormDatePicker({
  id,
  name,
  value,
  onChange,
  disabled = false,
  className,
  'aria-labelledby': ariaLabelledBy,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  'aria-labelledby'?: string;
}) {
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const dialogId = `${generatedId}-dialog`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, left: 0, width: 0 });
  const parsed = parseIsoDate(value);
  const todayIso = localTodayIsoDate();
  const todayParts = parseIsoDate(todayIso) ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
  };
  const initialMonth: CalendarParts = parsed ?? todayParts;
  const [viewYear, setViewYear] = useState(initialMonth.year);
  const [viewMonth, setViewMonth] = useState(initialMonth.month);
  const cells = buildMonthCells(viewYear, viewMonth);

  useEffect(() => {
    setMounted(true);
  }, []);

  const syncAnchor = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const panelWidth = Math.max(rect.width, 288);
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - panelWidth - 12);
    }
    const below = rect.bottom + 6;
    const estimatedHeight = 320;
    const top =
      below + estimatedHeight > window.innerHeight - 12
        ? Math.max(12, rect.top - estimatedHeight - 6)
        : below;
    setAnchor({ top, left, width: panelWidth });
  }, []);

  const closeMenu = useCallback((opts?: { restoreFocus?: boolean }) => {
    setOpen(false);
    if (opts?.restoreFocus !== false) {
      triggerRef.current?.focus();
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    syncAnchor();
    function onReposition() {
      syncAnchor();
    }
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, syncAnchor]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const next = parseIsoDate(value) ?? parseIsoDate(localTodayIsoDate());
    if (next != null) {
      setViewYear(next.year);
      setViewMonth(next.month);
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) {
        return;
      }
      if (panelRef.current?.contains(target)) {
        return;
      }
      closeMenu({ restoreFocus: false });
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [closeMenu, open, value]);

  function selectDay(iso: string) {
    onChange(iso);
    closeMenu();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      setOpen(true);
    }
  }

  function goMonth(delta: number) {
    const next = shiftMonth(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
  }

  const label = formatIsoDateLabel(value);
  const monthLabel = formatMonthYearLabel(viewYear, viewMonth);

  const panel =
    open && mounted
      ? createPortal(
          <div
            ref={panelRef}
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-label="Choose date"
            className="form-date-panel overlay-surface overlay-panel-motion"
            style={{
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
            }}
          >
            <div className="form-date-toolbar">
              <button
                type="button"
                className="form-date-nav"
                aria-label="Previous month"
                onClick={() => {
                  goMonth(-1);
                }}
              >
                <ChevronIcon direction="prev" />
              </button>
              <p className="form-date-month">{monthLabel}</p>
              <button
                type="button"
                className="form-date-nav"
                aria-label="Next month"
                onClick={() => {
                  goMonth(1);
                }}
              >
                <ChevronIcon direction="next" />
              </button>
            </div>
            <div className="form-date-weekdays" aria-hidden>
              {WEEKDAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="form-date-grid" role="grid" aria-label={monthLabel}>
              {cells.map((cell) => {
                const selected = cell.iso === value;
                const isToday = cell.iso === todayIso;
                return (
                  <button
                    key={cell.iso + (cell.outside ? '-o' : '')}
                    type="button"
                    role="gridcell"
                    aria-selected={selected}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={formatIsoDateLabel(cell.iso)}
                    className={[
                      'form-date-day',
                      selected ? 'is-selected' : '',
                      isToday ? 'is-today' : '',
                      cell.outside ? 'is-outside' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      selectDay(cell.iso);
                    }}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
            <div className="form-date-footer">
              <button
                type="button"
                className="form-date-today"
                onClick={() => {
                  selectDay(todayIso);
                }}
              >
                Today
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={['form-date-root', className].filter(Boolean).join(' ')}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-labelledby={ariaLabelledBy}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        onKeyDown={onTriggerKeyDown}
        className={['form-date', open ? 'is-open' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <span className="truncate">{label}</span>
        <CalendarIcon className="form-date-icon" />
      </button>
      {panel}
    </div>
  );
}
