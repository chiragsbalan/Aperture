/**
 * @fileoverview Title community score: ``4.5/5`` + matching star row.
 */

import { useId } from 'react';

import type { TitleRating } from '@/lib/catalog';

const STAR_PATH =
  'M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9L12 2.5z';
const STAR_VALUES = [1, 2, 3, 4, 5] as const;

/** Red → orange → yellow → green by score on the 0–5 scale. */
export function ratingToneColor(value: number): string {
  if (value >= 4) {
    return 'var(--color-action-log)';
  }
  if (value >= 3) {
    return 'var(--color-action-watchlist)';
  }
  if (value >= 2) {
    return 'var(--color-rating-orange)';
  }
  return 'var(--color-danger)';
}

/** One-decimal score used for label, tone, and star fill (matches UI). */
function displayScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatScore(value: number): string {
  return displayScore(value).toFixed(1);
}

/** Fill fraction for star ``star`` (1–5) given a continuous 0–5 rating. */
function fillFraction(rating: number, star: number): number {
  return Math.min(1, Math.max(0, rating - (star - 1)));
}

function ScoreStar({
  fill,
  clipId,
  className,
}: {
  fill: number;
  clipId: string;
  className?: string;
}) {
  const clamped = Math.min(1, Math.max(0, fill));
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <path
        d={STAR_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity={clamped >= 1 ? 0 : 0.35}
      />
      {clamped >= 1 ? <path d={STAR_PATH} fill="currentColor" /> : null}
      {clamped > 0 && clamped < 1 ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={24 * clamped} height="24" />
            </clipPath>
          </defs>
          <path
            d={STAR_PATH}
            fill="currentColor"
            clipPath={`url(#${clipId})`}
          />
        </>
      ) : null}
    </svg>
  );
}

/** Large read-only community score under title meta. */
export function TitleScore({ rating }: { rating: TitleRating }) {
  const baseId = useId();
  const score = displayScore(rating.value);
  const tone = ratingToneColor(score);
  const label = `${formatScore(score)} out of 5`;

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:mt-4"
      aria-label={label}
    >
      <span
        className="font-display text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl"
        style={{ color: tone }}
      >
        {formatScore(score)}
        <span className="text-lg font-medium text-muted sm:text-xl">/5</span>
      </span>
      <div className="flex items-center gap-0.5" style={{ color: tone }}>
        {STAR_VALUES.map((star) => (
          <ScoreStar
            key={star}
            clipId={`${baseId}-${star}`}
            fill={fillFraction(score, star)}
            className="text-[1.35rem] sm:text-[1.5rem]"
          />
        ))}
      </div>
    </div>
  );
}
