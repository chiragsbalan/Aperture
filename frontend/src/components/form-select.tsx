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

export interface FormSelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Custom listbox — `.overlay-surface` panel (account-menu gradient language).
 */
export function FormSelect<T extends string>({
  id,
  name,
  value,
  options,
  onChange,
  disabled = false,
  className,
  'aria-labelledby': ariaLabelledBy,
}: {
  id?: string;
  name?: string;
  value: T;
  options: ReadonlyArray<FormSelectOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  'aria-labelledby'?: string;
}) {
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const listboxId = `${generatedId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, left: 0, width: 0 });
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  );

  const selected =
    options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    setMounted(true);
  }, []);

  const syncAnchor = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
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
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) {
        return;
      }
      if (listRef.current?.contains(target)) {
        return;
      }
      closeMenu({ restoreFocus: false });
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        // Close the listbox only — do not dismiss a parent overlay sheet.
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
  }, [closeMenu, open, options, value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const option = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`,
    );
    option?.focus();
  }, [open, activeIndex]);

  function selectValue(next: T) {
    onChange(next);
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

  function onOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index + 1) % options.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index - 1 + options.length) % options.length);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (event.key === 'Tab') {
      closeMenu({ restoreFocus: false });
    }
  }

  const listbox =
    open && mounted
      ? createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={ariaLabelledBy ?? triggerId}
            className="form-select-panel overlay-surface overlay-panel-motion"
            style={{
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
            }}
          >
            {options.map((option, index) => {
              const selectedOption = option.value === value;
              const active = index === activeIndex;
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    data-option-index={index}
                    aria-selected={selectedOption}
                    tabIndex={active ? 0 : -1}
                    className={[
                      'form-select-option',
                      selectedOption ? 'is-selected' : '',
                      active ? 'is-active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseEnter={() => {
                      setActiveIndex(index);
                    }}
                    onClick={() => {
                      selectValue(option.value);
                    }}
                    onKeyDown={(event) => {
                      onOptionKeyDown(event, index);
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectValue(option.value);
                      }
                    }}
                  >
                    <span className="form-select-option-check" aria-hidden>
                      {selectedOption ? (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12.5l4.5 4.5L19 7" />
                        </svg>
                      ) : null}
                    </span>
                    <span>{option.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className={['form-select-root', className].filter(Boolean).join(' ')}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={ariaLabelledBy}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        onKeyDown={onTriggerKeyDown}
        className={['form-select', open ? 'is-open' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <span className="truncate">{selected?.label ?? ''}</span>
      </button>
      {listbox}
    </div>
  );
}
