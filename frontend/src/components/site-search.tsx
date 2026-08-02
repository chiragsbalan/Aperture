'use client';

import { useRouter } from 'next/navigation';
import {
  type AnimationEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

type OverlayPhase = 'closed' | 'open' | 'closing';

const CLOSE_ANIMATION_MS = 220;

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function applySiblingInert(portalRoot: HTMLElement): HTMLElement[] {
  const inerted: HTMLElement[] = [];
  for (const child of Array.from(document.body.children)) {
    if (child === portalRoot || !(child instanceof HTMLElement)) {
      continue;
    }
    if (!child.inert) {
      child.inert = true;
      inerted.push(child);
    }
  }
  return inerted;
}

function clearSiblingInert(inerted: HTMLElement[]) {
  for (const el of inerted) {
    el.inert = false;
  }
}

/**
 * Header search trigger: icon opens a centered translucent search overlay.
 * Available signed-in and signed-out.
 */
export function SiteSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const inputId = useId();
  const dialogId = useId();
  const descriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const previousOverflowRef = useRef('');
  const inertedRef = useRef<HTMLElement[]>([]);
  const navigatedAwayRef = useRef(false);
  const chromeActiveRef = useRef(false);
  const phaseRef = useRef<OverlayPhase>('closed');
  const [phase, setPhase] = useState<OverlayPhase>('closed');
  const [q, setQ] = useState(initialQuery);
  const [mounted, setMounted] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  const isVisible = phase !== 'closed';
  const isLeaving = phase === 'closing';

  phaseRef.current = phase;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const teardownOverlayChrome = useCallback(() => {
    clearSiblingInert(inertedRef.current);
    inertedRef.current = [];
    document.body.removeAttribute('data-search-open');
    if (chromeActiveRef.current) {
      document.body.style.overflow = previousOverflowRef.current;
      chromeActiveRef.current = false;
    }
  }, []);

  const finishClose = useCallback(() => {
    clearCloseTimer();
    // B1: clear inert → data-search-open → overflow, then focus trigger.
    teardownOverlayChrome();
    if (!navigatedAwayRef.current) {
      triggerRef.current?.focus();
    }
    setPhase('closed');
  }, [clearCloseTimer, teardownOverlayChrome]);

  const beginClose = useCallback(() => {
    if (phaseRef.current !== 'open') {
      return;
    }
    setPhase('closing');
    clearCloseTimer();
    // Fallback if animationend is skipped (reduced motion / interrupted).
    closeTimerRef.current = window.setTimeout(() => {
      finishClose();
    }, CLOSE_ANIMATION_MS);
  }, [clearCloseTimer, finishClose]);

  // Overlay chrome + Escape/Tab while visible; full cleanup on unmount or close.
  useLayoutEffect(() => {
    if (!isVisible || !portalRoot) {
      return;
    }

    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.setAttribute('data-search-open', '');
    chromeActiveRef.current = true;
    inertedRef.current = applySiblingInert(portalRoot);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && phaseRef.current === 'open') {
        event.preventDefault();
        beginClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const input = inputRef.current;
      const closeButton = closeButtonRef.current;
      if (!input || !closeButton) {
        return;
      }

      const first = input;
      const last = closeButton;
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !portalRoot.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !portalRoot.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearCloseTimer();
      teardownOverlayChrome();
    };
  }, [
    isVisible,
    portalRoot,
    beginClose,
    clearCloseTimer,
    teardownOverlayChrome,
  ]);

  useEffect(() => {
    if (phase !== 'open' || !portalRoot) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [phase, portalRoot]);

  function onPanelAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (phase !== 'closing') {
      return;
    }
    finishClose();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = q.trim();
    // Hard abort: skip animated close + focus restore; unmount cleanup tears down chrome.
    navigatedAwayRef.current = true;
    clearCloseTimer();
    setPhase('closed');
    if (!cleaned) {
      router.push('/search');
      return;
    }
    router.push(`/search?q=${encodeURIComponent(cleaned)}`);
  }

  const overlay =
    isVisible && mounted
      ? createPortal(
          <div
            ref={setPortalRoot}
            data-search-portal=""
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
          >
            <div
              className={[
                'search-overlay-backdrop absolute inset-0 bg-[rgba(12,11,9,0.62)] backdrop-blur-[6px]',
                isLeaving ? 'is-leaving' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="presentation"
              onClick={beginClose}
            />
            <div
              id={dialogId}
              role="dialog"
              aria-modal="true"
              aria-label="Search"
              aria-describedby={descriptionId}
              className={[
                'search-overlay-panel relative z-[1] w-full max-w-xl',
                isLeaving ? 'is-leaving' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onAnimationEnd={onPanelAnimationEnd}
            >
              <p id={descriptionId} className="sr-only">
                Press Escape to close search.
              </p>
              <form role="search" onSubmit={onSubmit}>
                <label htmlFor={inputId} className="sr-only">
                  Search movies, TV, and people
                </label>
                <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[rgba(22,20,17,0.72)] px-4 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                  <SearchIcon className="shrink-0 text-muted" />
                  <input
                    ref={inputRef}
                    id={inputId}
                    name="q"
                    type="search"
                    value={q}
                    onChange={(event) => {
                      setQ(event.target.value);
                    }}
                    placeholder="Search titles and people"
                    autoComplete="off"
                    maxLength={100}
                    className="min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted outline-none focus-visible:outline-none"
                  />
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={beginClose}
                    aria-label="Close search"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-muted transition hover:bg-[var(--color-accent-soft)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                  >
                    <CloseIcon />
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          navigatedAwayRef.current = false;
          clearCloseTimer();
          setPhase('open');
        }}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-muted transition hover:bg-[var(--color-accent-soft)] hover:text-foreground sm:h-12 sm:w-12"
        aria-label="Search movies, TV, and people"
        aria-expanded={isVisible}
        aria-controls={dialogId}
        aria-haspopup="dialog"
      >
        <SearchIcon className="h-6 w-6 sm:h-7 sm:w-7" />
      </button>
      {overlay}
    </>
  );
}
