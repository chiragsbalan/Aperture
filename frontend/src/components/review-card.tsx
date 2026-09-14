'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { ProfileAvatar } from '@/components/profile-avatar';
import { StarRating } from '@/components/star-rating';
import { TitleOverview } from '@/components/title-overview';
import { TitlePosterLink } from '@/components/title-poster-link';
import { hrefForLibraryContent } from '@/lib/library';
import { formatIsoMonthYear } from '@/lib/iso_date';
import { formatReviewScore, type TitleReview } from '@/lib/reviews';

function ThumbUpIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-7 w-7"
    >
      <path d="M7 11v9H4.75A1.75 1.75 0 0 1 3 18.25v-5.5C3 11.784 3.784 11 4.75 11H7z" />
      <path d="M7 11l3.2-6.1A1.8 1.8 0 0 1 11.8 4h.45c.97 0 1.75.78 1.75 1.75V8h4.25A1.75 1.75 0 0 1 20 9.75l-.85 7.5A1.75 1.75 0 0 1 17.41 19H7" />
    </svg>
  );
}

function ThumbDownIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-7 w-7"
    >
      <path d="M17 13V4h2.25C20.216 4 21 4.784 21 5.75v5.5C21 12.216 20.216 13 19.25 13H17z" />
      <path d="M17 13l-3.2 6.1A1.8 1.8 0 0 1 12.2 20h-.45A1.75 1.75 0 0 1 10 18.25V16H5.75A1.75 1.75 0 0 1 4 14.25l.85-7.5A1.75 1.75 0 0 1 6.59 5H17" />
    </svg>
  );
}

function VoteButton({
  label,
  pressed,
  disabled,
  href,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const className = `library-action-icon library-action-vote inline-flex h-11 w-11 items-center justify-center ${
    pressed ? 'is-active' : ''
  }`;
  if (href != null) {
    return (
      <Link href={href} aria-label={label} title={label} className={className}>
        <span className="library-action-icon-glyph inline-flex">
          {children}
        </span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`${className} disabled:opacity-50`}
    >
      <span className="library-action-icon-glyph inline-flex">{children}</span>
    </button>
  );
}

export function ReviewCard({
  review,
  signedIn,
  viewerUsername,
  revealed,
  showPoster = false,
  votePending = false,
  onReveal,
  onVote,
}: {
  review: TitleReview;
  signedIn: boolean;
  viewerUsername: string | null;
  revealed: boolean;
  showPoster?: boolean;
  votePending?: boolean;
  onReveal: (id: string) => void;
  onVote: (id: string, next: 1 | -1 | null) => void;
}) {
  const isAuthor =
    viewerUsername != null && viewerUsername === review.author.username;
  const watchedLabel = formatIsoMonthYear(review.watched_at);
  const displayName =
    review.author.display_name?.trim() || `@${review.author.username}`;
  const spoilerGated = review.contains_spoilers && !isAuthor && !revealed;
  const bodyText = spoilerGated ? '' : (review.note ?? '');
  const liked = review.viewer_vote === 1;
  const disliked = review.viewer_vote === -1;
  const loginHref = '/login';
  const content = review.content;

  function handleLike() {
    onVote(review.id, liked ? null : 1);
  }

  function handleDislike() {
    onVote(review.id, disliked ? null : -1);
  }

  const score = (
    <p
      className="min-w-[1.5rem] text-sm text-muted"
      aria-label={`Score ${formatReviewScore(review.score)}`}
    >
      {formatReviewScore(review.score)}
    </p>
  );

  const votesAndScore = (
    <div className="mt-3 flex items-center gap-1">
      {isAuthor ? null : (
        <>
          <VoteButton
            label={signedIn ? 'Like review' : 'Log in to like this review'}
            pressed={liked}
            disabled={votePending}
            href={signedIn ? undefined : loginHref}
            onClick={signedIn ? handleLike : undefined}
          >
            <ThumbUpIcon filled={liked} />
          </VoteButton>
          <VoteButton
            label={
              signedIn ? 'Dislike review' : 'Log in to dislike this review'
            }
            pressed={disliked}
            disabled={votePending}
            href={signedIn ? undefined : loginHref}
            onClick={signedIn ? handleDislike : undefined}
          >
            <ThumbDownIcon filled={disliked} />
          </VoteButton>
        </>
      )}
      {score}
    </div>
  );

  return (
    <article className="min-w-0">
      <div className="flex gap-3">
        {showPoster && content != null ? (
          <div className="w-16 shrink-0 overflow-hidden sm:w-20">
            <TitlePosterLink
              href={hrefForLibraryContent(content)}
              contentId={content.id}
              posterUrl={content.poster_url}
              posterAlt={content.title}
              ariaLabel={content.title}
              sizes="80px"
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href={`/u/${encodeURIComponent(review.author.username)}`}
              className="inline-flex min-w-0 items-center gap-2 text-foreground underline decoration-[var(--color-border)] underline-offset-4 transition hover:decoration-accent"
            >
              <ProfileAvatar
                username={review.author.username}
                displayName={review.author.display_name}
                avatarUrl={review.author.avatar_url}
                size="sm"
              />
              <span className="truncate">{displayName}</span>
            </Link>
            {watchedLabel != null ? (
              <time
                dateTime={review.watched_at}
                className="text-xs text-muted sm:text-sm"
              >
                {watchedLabel}
              </time>
            ) : null}
          </div>
          <div className="mt-2">
            <StarRating rating={review.rating} />
          </div>
        </div>
      </div>

      {spoilerGated ? (
        <button
          type="button"
          className="review-spoiler-gate mt-3"
          aria-expanded={false}
          onClick={() => {
            onReveal(review.id);
          }}
        >
          <span className="block text-sm font-medium text-foreground">
            This review contains spoilers.
          </span>
          <span className="mt-0.5 block text-xs text-muted sm:text-sm">
            Tap to show.
          </span>
        </button>
      ) : bodyText.trim() !== '' ? (
        <div className="mt-3">
          <TitleOverview text={bodyText} />
        </div>
      ) : null}

      {votesAndScore}
    </article>
  );
}
