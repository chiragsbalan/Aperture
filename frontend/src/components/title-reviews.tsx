'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { ReviewCard } from '@/components/review-card';
import { ReviewsListSkeleton } from '@/components/skeleton';
import {
  DIARY_LOGGED_CHANGED_EVENT,
  toLibraryContentType,
} from '@/lib/library';
import {
  fetchTitleReview,
  fetchTitleReviews,
  mergeReview,
  putReviewVote,
  TITLE_REVIEWS_INLINE_LIMIT,
  type ReviewVote,
  type TitleReview,
} from '@/lib/reviews';

export function TitleReviews({
  contentType,
  contentId,
  onMetaChange,
}: {
  contentType: string;
  contentId: string;
  onMetaChange?: (meta: { total: number; ready: boolean }) => void;
}) {
  const { status: sessionStatus, me } = useAuth();
  const kind = toLibraryContentType(contentType);
  const viewerUsername = me?.user?.username ?? null;
  const signedIn = sessionStatus === 'signed_in';
  const [items, setItems] = useState<TitleReview[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [votePendingId, setVotePendingId] = useState<string | null>(null);

  useEffect(() => {
    if (kind == null || sessionStatus === 'loading') {
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);

    async function load() {
      const result = await fetchTitleReviews(
        kind as NonNullable<typeof kind>,
        contentId,
        {
          page: 1,
          limit: TITLE_REVIEWS_INLINE_LIMIT,
          sort: 'popular',
          spoilerFilter: 'all',
          ratingFilter: 'any',
        },
      );
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setStatus('error');
        setError(result.error);
        return;
      }
      setItems(result.data.items);
      setTotal(result.data.total);
      setStatus('ready');
    }

    void load();

    function onDiaryChanged() {
      void load();
    }
    window.addEventListener(DIARY_LOGGED_CHANGED_EVENT, onDiaryChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(DIARY_LOGGED_CHANGED_EVENT, onDiaryChanged);
    };
  }, [kind, contentId, sessionStatus]);

  const reviewsReady = status === 'ready';

  useEffect(() => {
    if (onMetaChange == null) {
      return;
    }
    onMetaChange({
      total,
      ready: reviewsReady,
    });
  }, [onMetaChange, total, reviewsReady]);

  if (kind == null) {
    return null;
  }
  const titleKind = kind;

  async function handleReveal(id: string) {
    const result = await fetchTitleReview(titleKind, contentId, id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRevealedIds((current) => new Set(current).add(id));
    setItems((current) => mergeReview(current, result.review));
  }

  async function handleVote(id: string, next: ReviewVote | null) {
    if (!signedIn) {
      return;
    }
    setVotePendingId(id);
    setError(null);
    const result = await putReviewVote(id, next);
    setVotePendingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems((current) => mergeReview(current, result.review));
  }

  const inlineItems = items.slice(0, TITLE_REVIEWS_INLINE_LIMIT);

  return (
    <div>
      {status === 'loading' ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading reviews…</span>
          <ReviewsListSkeleton />
        </div>
      ) : null}

      {status === 'error' ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error ?? 'Could not load reviews.'}
        </p>
      ) : null}

      {status === 'ready' && inlineItems.length === 0 ? (
        <p className="text-xs text-muted sm:text-sm">No reviews yet.</p>
      ) : null}

      {status === 'ready' && inlineItems.length > 0 ? (
        <ul className="space-y-6">
          {inlineItems.map((review) => (
            <li key={review.id}>
              <ReviewCard
                review={review}
                signedIn={signedIn}
                viewerUsername={viewerUsername}
                revealed={revealedIds.has(review.id)}
                votePending={votePendingId === review.id}
                onReveal={(id) => {
                  void handleReveal(id);
                }}
                onVote={(id, next) => {
                  void handleVote(id, next);
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {error != null && status === 'ready' ? (
        <p className="mt-3 text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
