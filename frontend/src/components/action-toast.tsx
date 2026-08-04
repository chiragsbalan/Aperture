'use client';

import { useEffect, useRef } from 'react';

const TOAST_MS = 5000;

/**
 * Fixed bottom toast for short-lived actions (e.g. remove + Undo).
 */
export function ActionToast({
  message,
  actionLabel,
  onAction,
  onDismiss,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismissRef.current();
    }, TOAST_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [message]);

  return (
    <div
      role="status"
      className="pointer-events-auto fixed inset-x-0 bottom-6 z-[var(--z-overlay)] flex justify-center px-4"
    >
      <div className="overlay-surface flex max-w-md items-center gap-4 px-4 py-3 text-sm text-foreground shadow-lg">
        <p className="min-w-0 flex-1">{message}</p>
        {actionLabel != null && onAction != null ? (
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            onClick={() => {
              onAction();
              onDismiss();
            }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
