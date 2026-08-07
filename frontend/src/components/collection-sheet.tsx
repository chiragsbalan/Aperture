'use client';

import {
  type AnimationEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { MOTION_DURATION_MED_MS } from '@/lib/motion';
import {
  applySiblingInert,
  clearBodyDataAttr,
  clearSiblingInert,
  CLOSE_ACCOUNT_EVENT,
  CLOSE_SEARCH_EVENT,
  dispatchOverlayClose,
  lockBodyOverflow,
  restoreBodyOverflow,
  saveBodyOverflow,
  setBodyDataAttr,
} from '@/lib/overlay_chrome';
import { useScrollFadeY } from '@/lib/scroll-fade';

const COLLECTION_SHEET_OPEN_ATTR = 'data-collection-sheet-open';

interface CollectionSheetProps {
  open: boolean;
  title: string;
  /**
   * After the leave animation finishes. Lazy-mounted parents unmount here.
   * Simple parents that only flip ``open`` may use the same fn as dismiss.
   */
  onClose: () => void;
  /**
   * User asked to dismiss (backdrop / Escape / Done). Must set ``open`` to
   * false. Defaults to ``onClose`` when omitted (for sheets that only toggle
   * open state).
   */
  onDismiss?: () => void;
  children: ReactNode;
}

/**
 * Shared centered overlay sheet (search / followers aesthetic).
 * Use for modal forms and collection lists — not native `<dialog>`.
 *
 * Fully controlled by ``open``: dismiss only asks the parent to set
 * ``open={false}``; leave animation + ``onClose`` follow from that.
 */
export function CollectionSheet({
  open,
  title,
  onClose,
  onDismiss,
  children,
}: CollectionSheetProps) {
  const dialogId = useId();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyHostRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  /** Guards timer + animationend so ``onClose`` runs once per leave. */
  const finishCloseOnceRef = useRef(false);
  const previousOverflowRef = useRef('');
  const inertedRef = useRef<HTMLElement[]>([]);
  const chromeActiveRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onDismissRef = useRef(onDismiss);
  const [mounted, setMounted] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  /** Keep portal painted through the leave animation after ``open`` flips. */
  const [present, setPresent] = useState(open);
  const [leaving, setLeaving] = useState(false);

  onCloseRef.current = onClose;
  onDismissRef.current = onDismiss;

  useScrollFadeY(bodyRef, present, bodyHostRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const teardownOverlayChrome = useCallback(() => {
    clearSiblingInert(inertedRef.current);
    inertedRef.current = [];
    clearBodyDataAttr(COLLECTION_SHEET_OPEN_ATTR);
    if (chromeActiveRef.current) {
      restoreBodyOverflow(previousOverflowRef.current);
      chromeActiveRef.current = false;
    }
  }, []);

  const finishClose = useCallback(() => {
    if (finishCloseOnceRef.current) {
      return;
    }
    finishCloseOnceRef.current = true;
    clearCloseTimer();
    teardownOverlayChrome();
    setLeaving(false);
    setPresent(false);
    onCloseRef.current();
  }, [clearCloseTimer, teardownOverlayChrome]);

  const finishCloseRef = useRef(finishClose);
  finishCloseRef.current = finishClose;

  // Drive presence / leave solely from the controlled ``open`` prop.
  useEffect(() => {
    if (open) {
      dispatchOverlayClose(CLOSE_SEARCH_EVENT);
      dispatchOverlayClose(CLOSE_ACCOUNT_EVENT);
      clearCloseTimer();
      finishCloseOnceRef.current = false;
      setPresent(true);
      setLeaving(false);
      return;
    }
    if (!present) {
      return;
    }
    setLeaving(true);
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      finishCloseRef.current();
    }, MOTION_DURATION_MED_MS);
    return () => {
      clearCloseTimer();
    };
  }, [open, present, clearCloseTimer]);

  const requestClose = useCallback(() => {
    if (leaving) {
      finishCloseRef.current();
      return;
    }
    if (!open && !present) {
      return;
    }
    const dismiss = onDismissRef.current ?? onCloseRef.current;
    dismiss();
  }, [leaving, open, present]);

  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useLayoutEffect(() => {
    if (!present || !portalRoot) {
      return;
    }

    previousOverflowRef.current = saveBodyOverflow();
    lockBodyOverflow();
    setBodyDataAttr(COLLECTION_SHEET_OPEN_ATTR);
    chromeActiveRef.current = true;
    inertedRef.current = applySiblingInert(portalRoot);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestCloseRef.current();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      teardownOverlayChrome();
    };
  }, [present, portalRoot, teardownOverlayChrome]);

  useEffect(() => {
    if (!present || leaving || !portalRoot) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [present, leaving, portalRoot]);

  function onPanelAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (!leaving) {
      return;
    }
    finishCloseRef.current();
  }

  if (!mounted || !present) {
    return null;
  }

  return createPortal(
    <div
      ref={setPortalRoot}
      data-collection-sheet-portal=""
      className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center px-4 py-8 sm:px-6"
    >
      <div
        className={[
          'search-overlay-backdrop absolute inset-0 bg-[rgba(12,11,9,0.62)] backdrop-blur-[6px]',
          leaving ? 'is-leaving' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="presentation"
        onClick={() => {
          requestClose();
        }}
      />
      <div
        ref={panelRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={[
          'collection-sheet-panel overlay-surface overlay-panel-motion relative z-[1] w-full max-w-md overflow-hidden outline-none',
          leaving ? 'is-leaving' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onAnimationEnd={onPanelAnimationEnd}
      >
        <header className="overlay-header-rule flex items-center px-4 py-3">
          <h1
            id={titleId}
            className="min-w-0 truncate font-display text-xl font-semibold tracking-tight text-foreground"
          >
            {title}
          </h1>
        </header>
        <div
          ref={bodyHostRef}
          className="scroll-fade-y-host collection-sheet-body"
        >
          <div ref={bodyRef} className="scroll-fade-y h-full px-4">
            {/* Vertical padding lives inside the scroller so edge fades cover
                content (half a people row), not empty py-* space. */}
            <div className="py-5">{children}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
