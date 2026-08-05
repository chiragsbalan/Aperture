'use client';

import { useId, useRef, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Half-star ratings (0.5–5). Display is read-only filled stars; input lets
 * the user pick a value or clear it.
 */

const STAR_VALUES = [1, 2, 3, 4, 5] as const;
const STAR_PATH =
  'M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9L12 2.5z';
/** Movement past this (px) turns a press into a scrub gesture. */
const SCRUB_THRESHOLD_PX = 8;

function StarIcon({
  fill,
  clipId,
  className,
}: {
  /** 0 empty, 0.5 half, 1 full */
  fill: 0 | 0.5 | 1;
  clipId: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {fill === 0.5 ? (
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width="12" height="24" />
          </clipPath>
        </defs>
      ) : null}
      <path
        d={STAR_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity={fill === 0 ? 0.35 : 0}
      />
      {fill === 1 ? <path d={STAR_PATH} fill="currentColor" /> : null}
      {fill === 0.5 ? (
        <path d={STAR_PATH} fill="currentColor" clipPath={`url(#${clipId})`} />
      ) : null}
    </svg>
  );
}

function fillForStar(rating: number, star: number): 0 | 0.5 | 1 {
  if (rating >= star) {
    return 1;
  }
  if (rating >= star - 0.5) {
    return 0.5;
  }
  return 0;
}

/** Map a pointer X across the star row to 0.5–5.0 half-star steps. */
export function ratingFromClientX(
  container: HTMLElement,
  clientX: number,
): number {
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0) {
    return 0.5;
  }
  const x = Math.min(Math.max(clientX - rect.left, 0), rect.width - 0.001);
  const slot = Math.floor((x / rect.width) * 10) + 1;
  return Math.min(5, Math.max(0.5, slot / 2));
}

/** Read-only accent-coloured filled stars (hidden when rating is null). */
export function StarRating({ rating }: { rating: number | null | undefined }) {
  const baseId = useId();
  if (rating == null) {
    return null;
  }
  return (
    <div
      className="flex items-center gap-0.5 text-[var(--color-accent)]"
      aria-label={`${rating} out of 5 stars`}
    >
      {STAR_VALUES.map((star) => (
        <StarIcon
          key={star}
          clipId={`${baseId}-${star}`}
          fill={fillForStar(rating, star)}
          className="text-base"
        />
      ))}
    </div>
  );
}

/**
 * Next rating after tapping star ``star`` (1–5).
 *
 * - Stars 2–5: first tap → full N; same star again toggles N ↔ N−0.5.
 * - Star 1: cycles 1 → 0.5 → cleared (only way to remove a rating).
 * - Tapping a different star jumps to that full value.
 */
export function nextStarRating(
  value: number | null,
  star: number,
): number | null {
  if (star === 1) {
    if (value === 1) {
      return 0.5;
    }
    if (value === 0.5) {
      return null;
    }
    return 1;
  }
  if (value === star) {
    return star - 0.5;
  }
  if (value === star - 0.5) {
    return star;
  }
  return star;
}

interface GestureState {
  pointerId: number;
  startX: number;
  startY: number;
  star: number;
  scrubbing: boolean;
}

/**
 * Interactive half-star picker (full-width). Tap cycles per
 * {@link nextStarRating}; drag/swipe across the row scrubs 0.5–5.
 */
export function StarRatingInput({
  value,
  onChange,
  id,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  id?: string;
}) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const valueRef = useRef(value);
  const suppressClickRef = useRef(false);
  valueRef.current = value;

  function endGesture(
    event: ReactPointerEvent<HTMLElement>,
    commitTap: boolean,
  ) {
    const gesture = gestureRef.current;
    if (gesture == null || gesture.pointerId !== event.pointerId) {
      return;
    }
    const root = rootRef.current;
    if (root?.hasPointerCapture(event.pointerId)) {
      root.releasePointerCapture(event.pointerId);
    }
    if (gesture.scrubbing) {
      suppressClickRef.current = true;
    } else if (commitTap) {
      suppressClickRef.current = true;
      onChange(nextStarRating(valueRef.current, gesture.star));
    }
    gestureRef.current = null;
  }

  return (
    <div
      ref={rootRef}
      id={id}
      role="group"
      aria-label="Rating out of 5"
      className="flex w-full touch-none items-center gap-1.5 text-[var(--color-accent)] sm:gap-2"
      onPointerMove={(event) => {
        const gesture = gestureRef.current;
        if (gesture == null || gesture.pointerId !== event.pointerId) {
          return;
        }
        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        if (
          !gesture.scrubbing &&
          (Math.abs(dx) >= SCRUB_THRESHOLD_PX ||
            Math.abs(dy) >= SCRUB_THRESHOLD_PX)
        ) {
          gesture.scrubbing = true;
        }
        if (!gesture.scrubbing) {
          return;
        }
        const root = rootRef.current;
        if (root == null) {
          return;
        }
        const next = ratingFromClientX(root, event.clientX);
        if (next !== valueRef.current) {
          onChange(next);
        }
      }}
      onPointerUp={(event) => {
        endGesture(event, true);
      }}
      onPointerCancel={(event) => {
        endGesture(event, false);
      }}
    >
      {STAR_VALUES.map((star) => (
        <button
          key={star}
          type="button"
          aria-label={
            star === 1
              ? value === 1
                ? '0.5 stars'
                : value === 0.5
                  ? 'Clear rating'
                  : '1 star'
              : value === star
                ? `${star - 0.5} stars`
                : `${star} stars`
          }
          className="relative inline-flex aspect-square min-w-0 flex-1"
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            gestureRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              star,
              scrubbing: false,
            };
            rootRef.current?.setPointerCapture(event.pointerId);
          }}
          onClick={() => {
            // Keyboard activation (and any click not already handled by pointer).
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            onChange(nextStarRating(value, star));
          }}
        >
          <StarIcon
            clipId={`${baseId}-${star}`}
            fill={value == null ? 0 : fillForStar(value, star)}
            className="pointer-events-none h-full w-full"
          />
        </button>
      ))}
    </div>
  );
}
