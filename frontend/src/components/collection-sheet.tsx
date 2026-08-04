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

type OverlayPhase = 'closed' | 'open' | 'closing';

interface CollectionSheetProps {
  open: boolean;
  title: string;
  /** Called after the leave animation finishes (parent clears open state). */
  onClose: () => void;
  children: ReactNode;
}

/**
 * Shared centered overlay sheet (search / followers aesthetic).
 * Use for modal forms and collection lists — not native `<dialog>`.
 */
export function CollectionSheet({
  open,
  title,
  onClose,
  children,
}: CollectionSheetProps) {
  const dialogId = useId();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyHostRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const previousOverflowRef = useRef('');
  const inertedRef = useRef<HTMLElement[]>([]);
  const chromeActiveRef = useRef(false);
  const phaseRef = useRef<OverlayPhase>('closed');
  const onCloseRef = useRef(onClose);
  const [phase, setPhase] = useState<OverlayPhase>('closed');
  const [mounted, setMounted] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  const isVisible = phase !== 'closed';
  const isLeaving = phase === 'closing';

  // Do not let a stale 'closing' render overwrite finishClose's synchronous
  // 'closed' claim (timer + animationend race before setPhase flushes).
  if (phaseRef.current !== 'closed' || phase === 'closed') {
    phaseRef.current = phase;
  }
  onCloseRef.current = onClose;

  useScrollFadeY(bodyRef, isVisible, bodyHostRef);

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
    if (phaseRef.current === 'closed') {
      return;
    }
    // Claim closed synchronously so timer + animationend cannot double-fire
    // onClose before React flushes setPhase.
    phaseRef.current = 'closed';
    clearCloseTimer();
    teardownOverlayChrome();
    setPhase('closed');
    onCloseRef.current();
  }, [clearCloseTimer, teardownOverlayChrome]);

  const beginClose = useCallback(() => {
    if (phaseRef.current !== 'open') {
      return;
    }
    setPhase('closing');
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      finishClose();
    }, MOTION_DURATION_MED_MS);
  }, [clearCloseTimer, finishClose]);

  useEffect(() => {
    if (open) {
      dispatchOverlayClose(CLOSE_SEARCH_EVENT);
      dispatchOverlayClose(CLOSE_ACCOUNT_EVENT);
      setPhase('open');
      return;
    }
    if (phaseRef.current === 'open') {
      beginClose();
    }
  }, [open, beginClose]);

  useLayoutEffect(() => {
    if (!isVisible || !portalRoot) {
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
        if (phaseRef.current === 'open') {
          beginClose();
        } else if (phaseRef.current === 'closing') {
          finishClose();
        }
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
    finishClose,
    clearCloseTimer,
    teardownOverlayChrome,
  ]);

  useEffect(() => {
    if (phase !== 'open' || !portalRoot) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus();
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

  if (!isVisible || !mounted) {
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
          isLeaving ? 'is-leaving' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="presentation"
        onClick={beginClose}
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
          isLeaving ? 'is-leaving' : '',
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
